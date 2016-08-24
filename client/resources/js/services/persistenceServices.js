'use strict';

/**** Lawnchair-related angular services ****/

angular.module('noScaffold.persistenceServices', [])
    /* Return the persistence configuration */
    .constant('persistenceCfg', {
        'persistPageElementsOutOfSyncRefreshTime': 5000,
        'deletePageElementsOutOfSyncRefreshTime': 5000
    })
    /* Wrapper to the lawnchair singleton */
    .factory('lawnchairService', function($window) {
        if (!angular.isDefined($window.Lawnchair)) {
            throw "Lawnchair library doesn't seem included in page"
        }
        return {
            'getLawnchairStorage': function(callback) {
                return new $window.Lawnchair({adapter: 'dom'}, callback);
            }
        };
    })
    .service('localStorageService', function(lawnchairService) {
        var lawnchairStorage = lawnchairService.getLawnchairStorage(_.noop);

        this.saveExcludedFeeds = function(excludedFeedIds, callback) {
            return lawnchairStorage.save({
                key: 'excludedFeeds',
                feedIds: excludedFeedIds
            }, callback);
        };

        this.excludeFeed = function(feed, callback) {
            this.getExcludedFeeds(function(excludedFeeds) {
                this.saveExcludedFeeds(excludedFeeds.append(feed.feedId), callback);
            })
        };

        this.getExcludedFeeds = function(callback) {
            lawnchairStorage.get('excludedFeeds', function(excludedFeeds) {
                callback(excludedFeeds.feedIds);
            });
        };

        this.saveExcludedFeeds([]);
    })
    .factory('persistenceService', function(persistenceCfg, serverCommunicationService, localStorageService,
                                            logService, doPageElementsIdsMatch) {
        function Persistence(registerEventHandlerDescriptors) {
            var connection = serverCommunicationService.getServerConnection();
            var localElementsToBePersistedIds = [],
                localElementsToBeDeletedIds = [],
                deletedElementIds = [];

            var getWrappedEventHandlerDescriptor = function(eventHandlerDescriptorKey) {
                var eventHandlerDescriptor = registerEventHandlerDescriptors[eventHandlerDescriptorKey];
                if (angular.isDefined(eventHandlerDescriptor)) {
                    if (angular.isDefined(eventHandlerDescriptor.scopeApplyWrapper)) {
                        return eventHandlerDescriptor.scopeApplyWrapper;
                    } else {
                        return eventHandlerDescriptor;
                    }
                }
            };

            var executeWrappedEventHandlerDescriptor = function(eventHandlerDescriptorKey, serverResponse) {
                var wrappedEventHandlerDescriptor = getWrappedEventHandlerDescriptor(eventHandlerDescriptorKey);
                if (angular.isFunction(wrappedEventHandlerDescriptor)) {
                    wrappedEventHandlerDescriptor(serverResponse);
                }
            };

            var pageElementSavedEventHandler = function(pageElement) {
                logService.logDebug('Persistence: Saving element "' + pageElement.pageElementId +
                    '" of type ' + pageElement.pageElementType + ' received from server');

                localStorageService.savePageElement(pageElement);

                executeWrappedEventHandlerDescriptor('pageElementSaved', pageElement);
            };

            var pageElementDeletedEventHandler = function(pageElementId) {
                logService.logDebug('Persistence: Deleting element "' + pageElementId + '" received from server');
                localStorageService.deletePageElement(pageElementId);
                if (deletedElementIds.indexOf(pageElementId) < 0) {
                    deletedElementIds.push(pageElementId);
                }

                executeWrappedEventHandlerDescriptor('pageElementDeleted', pageElementId);
            };

            var allPageElementsDeletedEventHandler = function(serverResponse) {
                logService.logDebug('Persistence: Deleting all elements received from server');
                localStorageService.deleteAllPageElements();

                executeWrappedEventHandlerDescriptor('allPageElementsDeleted', serverResponse);
            };

            var connectedToServerEventHandler = function() {
                logService.logDebug('Persistence: Connected to server, discovering all feeds from server');
                discoverFeeds(function(feeds) {
                    executeWrappedEventHandlerDescriptor('allFeedsDiscovered', feeds);
                });
            };

            connection.connectToServerEventsWithListeners(
                {'pageElementSaved': pageElementSavedEventHandler,
                    'pageElementDeleted': pageElementDeletedEventHandler,
                    'allPageElementsDeleted': allPageElementsDeletedEventHandler},
                {'connectedToServer': connectedToServerEventHandler});

            var discoverFeeds = function(callback) {
                if (connection.isConnected) {
                    localStorageService.getExcludedFeeds(function(excludedFeeds) {
                        connection.discoverFeeds(excludedFeeds, function(feeds) {
                            if (angular.isObject(feeds)) {
                                logService.logDebug('Persistence: Discovered ' + _.keys(feeds).length + ' feeds from server');
                                (callback || _.noop)(feeds);
                            }
                        }, function() {
                            logService.logError('Persistence: error occurred while discovering feeds from server');
                        });
                    });
                }
            };

            var savePageElementInServer = function(pageElementToSave, storeLocallyOnFailure) {
                connection.savePageElement(pageElementToSave, function() {
                    var matchElementToSave = _.partial(doPageElementsIdsMatch, pageElementToSave);
                    _.remove(localElementsToBePersistedIds, matchElementToSave);
                }, function() {
                    if (storeLocallyOnFailure) {
                        logService.logDebug('Persistence: Saving element "' + pageElement.pageElementId +
                            '" of type ' + pageElement.pageElementType + ' has failed, storing it for later');
                        localElementsToBePersistedIds.push(pageElement.pageElementId);
                        localStorageService.savePageElement(pageElement,
                            getWrappedEventHandlerDescriptor('pageElementSaved'));
                    }
                });
            };
            this.savePageElement = function(pageElement) {
                if (connection.isConnected && localElementsToBePersistedIds.indexOf(pageElement.pageElementId) < 0) {
                    savePageElementInServer(pageElement, true);
                } else {
                    if (localElementsToBePersistedIds.indexOf(pageElement.pageElementId) < 0) {
                        logService.logDebug('Persistence: Saving element "' + pageElement.pageElementId +
                            '" of type ' + pageElement.pageElementType + ', storing save for later');
                        localElementsToBePersistedIds.push(pageElement.pageElementId);
                    }
                    logService.logDebug('Persistence: Saving element "' + pageElement.pageElementId +
                        '" when not connected');
                    localStorageService.savePageElement(pageElement,
                        registerEventHandlerDescriptors['pageElementSaved']);
                }
            };

            var deletePageElementWrapper = function(callback, deletedPageElementId) {
                return function() {
                    if (angular.isDefined(callback)) {
                        callback(deletedPageElementId);
                    }
                }
            };

            var deletePageElementInServer = function(pageElementToDeleteId, storeLocallyOnFailure) {
                connection.deletePageElement(pageElementToDeleteId, function() {
                    var matchElementToDeleteId = _.partial(doPageElementsIdsMatch, pageElementToDeleteId);
                    _.remove(localElementsToBeDeletedIds, matchElementToDeleteId);
                }, function() {
                    if (storeLocallyOnFailure) {
                        logService.logDebug('Persistence: Deleting element "' + pageElementToDeleteId +
                            ' has failed, storing deletion for later');
                        localElementsToBeDeletedIds.push(pageElementToDeleteId);
                        localStorageService.deletePageElement(pageElementToDeleteId,
                            deletePageElementWrapper(getWrappedEventHandlerDescriptor('pageElementDeleted'),
                                pageElementToDeleteId));
                    }
                });
            };
            this.deletePageElement = function(pageElement) {
                if (connection.isConnected && localElementsToBeDeletedIds.indexOf(pageElement.pageElementId) < 0) {
                    deletePageElementInServer(pageElement.pageElementId, true);
                } else {
                    if (localElementsToBeDeletedIds.indexOf(pageElement.pageElementId) < 0) {
                        logService.logDebug('Persistence: Deleting element "' + pageElement.pageElementId +
                            '" of type ' + pageElement.pageElementType + ', storing deletion for later');
                        localElementsToBeDeletedIds.push(pageElement.pageElementId);
                    }
                    logService.logDebug('Persistence: Deleting element "' + pageElement.pageElementId +
                        '" when not connected');
                    localStorageService.deletePageElement(pageElement.pageElementId,
                        deletePageElementWrapper(registerEventHandlerDescriptors['pageElementDeleted'],
                            pageElement.pageElementId));
                }
                //Remove for elements to be persisted anyway
                var matchElementToDelete = _.partial(doPageElementsIdsMatch, pageElement);
                _.remove(localElementsToBePersistedIds, matchElementToDelete);
            };

            var deletingAllPageElementsAndStoringThemForLaterReconciliation = function(callback) {
                localStorageService.listAllPageElements(function (pageElements) {
                    localElementsToBeDeletedIds.push.apply(
                        localElementsToBeDeletedIds, _.pluck(pageElements, 'pageElementId'));
                    localElementsToBeDeletedIds = _.uniq(localElementsToBeDeletedIds);
                });
                localStorageService.deleteAllPageElements(callback);
            };

            this.deleteAllPageElements = function() {
                if (connection.isConnected) {
                    connection.deleteAllPageElements(undefined, function() {
                        logService.logDebug('Persistence: Deleting all elements has failed, storing deletions for later');
                        deletingAllPageElementsAndStoringThemForLaterReconciliation(
                            getWrappedEventHandlerDescriptor('allPageElementsDeleted'));
                    });
                } else {
                    logService.logDebug('Persistence: Deleting all elements when not connected, storing deletions for later');
                    deletingAllPageElementsAndStoringThemForLaterReconciliation(
                        registerEventHandlerDescriptors['allPageElementsDeleted']);
                }
            };

            this.fetchFeedItem = function(fetchParams) {
                if (connection.isConnected) {
                    connection.fetchFeedItem(fetchParams, registerEventHandlerDescriptors['feedItemFetched'],
                        function (status, message) {
                            logService.logDebug('Persistence: Fetching "' + fetchParams.itemIndex +
                                ' item from feed "' + fetchParams.feedId + '  has failed: ' + message);
                        });
                }
            };
        }

        return {
            'getPersistence': function(registerEventHandlerDescriptors) {
                return new Persistence(registerEventHandlerDescriptors);
            }
        }
    });
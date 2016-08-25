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

        var saveFeedsCollection = function(feedCollectionKey, feedIds, callback) {
            return lawnchairStorage.save({
                key: feedCollectionKey,
                feedIds: feedIds
            }, callback);
        };

        var changeFeedCollection = function(feedCollectionKey, feed, callback, transCallback) {
            return getFeedCollection(feedCollectionKey, function(feeds) {
                saveFeedsCollection(feedCollectionKey, transCallback(feeds), callback);
            });
        };

        var saveFeedInCollection = function(feedCollectionKey, feed, callback) {
            return changeFeedCollection(feedCollectionKey, feed, callback, function(feeds) {
                feeds.push(feed.feedId);
                return feeds;
            });
        };

        var removeFeedFromCollection = function(feedCollectionKey, feed, callback) {
            return changeFeedCollection(feedCollectionKey, feed, callback, function(feeds) {
                feeds.splice(feeds.indexOf(feed.feedId), 1);
                return feeds;
            });
        };

        var getFeedCollection = function(feedCollectionKey, callback) {
            return lawnchairStorage.get(feedCollectionKey, function(feeds) {
                callback(angular.isObject(feeds) ? feeds.feedIds || [] : []);
            });
        };

        this.excludeFeed = function(feed, callback) {
            return saveFeedInCollection('excludedFeeds', feed, callback);
        };

        this.getExcludedFeeds = function(callback) {
            return getFeedCollection('excludedFeeds', callback);
        };

        this.subscribeToFeed = function(feed, callback) {
            return saveFeedInCollection('subscribedFeeds', feed, callback);
        };

        this.unSubscribeFromFeed = function(feed, callback) {
            return removeFeedFromCollection('subscribedFeeds', feed, callback);
        };

        this.getSubscribedToFeeds = function(callback) {
            return getFeedCollection('subscribedFeeds', callback);
        };
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
                                localStorageService.getSubscribedToFeeds(function(subscribedToFeeds) {
                                    var partition = _.partition(feeds, function(feed) {
                                        return subscribedToFeeds.indexOf(feed.feedId) >= 0;
                                    });
                                    var transform = _.curryRight(_.keyBy, 2)(_.curryRight(_.get, 2)('feedId'));
                                    (callback || _.noop)({feeds: transform(partition[0]),
                                        suggestedFeeds: transform(partition[1])});
                                })
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

            var feedCallbackWrapper = function(callback, data) {
                return function() {
                    if (angular.isDefined(callback)) {
                        callback(data);
                    }
                }
            };

            this.subscribeToFeed = function(feed) {
                logService.logDebug('Persistence: Subscribing to feed ' + feed.feedId + ' in local storage');
                localStorageService.subscribeToFeed(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedSubscribed'], feed));
            };

            this.unsubscribeFromFeed = function(feed) {
                logService.logDebug('Persistence: Unsubscribing from feed ' + feed.feedId + ' in local storage');
                localStorageService.unSubscribeFromFeed(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedUnsubscribed'], feed));
            };

            this.excludeFeed = function(feed) {
                logService.logDebug('Persistence: Excluding feed ' + feed.feedId + ' from local storage');
                localStorageService.excludeFeed(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedExcluded'], feed.feedId));
            };
        }

        return {
            'getPersistence': function(registerEventHandlerDescriptors) {
                return new Persistence(registerEventHandlerDescriptors);
            }
        }
    });
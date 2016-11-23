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
    .service('localStorageService', function(lawnchairService, doFeedsIdsMatch) {
        var lawnchairStorage = lawnchairService.getLawnchairStorage(_.noop);

        var saveFeedsCollection = function(feedCollectionKey, feedElements, callback) {
            return lawnchairStorage.save({
                key: feedCollectionKey,
                feedElements: feedElements
            }, callback);
        };

        var changeFeedCollection = function(feedCollectionKey, callback, transCallback) {
            return getFeedCollection(feedCollectionKey, function(feeds) {
                saveFeedsCollection(feedCollectionKey, transCallback(feeds), callback);
            });
        };

        var addFeedInCollection = function(feedCollectionKey, feedElement, callback) {
            return changeFeedCollection(feedCollectionKey, callback, function(feeds) {
                feeds.push(feedElement);
                return feeds;
            });
        };

        var updateFeedInCollection = function(feedCollectionKey, feedId, callback, transFn) {
            return changeFeedCollection(feedCollectionKey, callback, function(feeds) {
                var feedElement = _.find(feeds, _.curry(doFeedsIdsMatch, 2)(feedId));
                if (angular.isObject(feedElement)) {
                    (transFn || _.identity)(feedElement);
                }
                return feeds;
            });
        };

        var removeFeedFromCollection = function(feedCollectionKey, feedId, callback) {
            return changeFeedCollection(feedCollectionKey, callback, function(feeds) {
                _.remove(feeds, _.curry(doFeedsIdsMatch, 2)(feedId));
                return feeds;
            });
        };

        var getFeedCollection = function(feedCollectionKey, callback, mapFn) {
            return lawnchairStorage.get(feedCollectionKey, function(feeds) {
                callback(angular.isObject(feeds) ?
                    _.map(feeds.feedElements || [], function(el) { return (mapFn || _.identity)(el); }) : []);
            });
        };

        this.excludeFeed = function(feed, callback) {
            return addFeedInCollection('excludedFeeds', _.pick(feed, ['feedId']), callback);
        };

        this.getExcludedFeeds = function(callback) {
            return getFeedCollection('excludedFeeds', callback, _.curryRight(_.get, 2)('feedId'));
        };

        this.subscribeToFeed = function(feed, callback) {
            return addFeedInCollection('subscribedFeeds',
                _.pick(feed, ['feedId', 'itemIndex', 'suggestedTemplate', 'suggestedCSSStyle', 'originalSuggestedTemplate']), callback);
        };

        this.unSubscribeFromFeed = function(feed, callback) {
            return removeFeedFromCollection('subscribedFeeds', feed.feedId, callback);
        };

        this.getSubscribedToFeeds = function(callback) {
            return getFeedCollection('subscribedFeeds', callback);
        };

        var updateFeed = function(feed, callback, transFn) {
            return updateFeedInCollection('subscribedFeeds', feed.feedId, callback, function(feedElement) {
                transFn(feed, feedElement);
            });
        };

        this.updateFeedItemIndex = function(feed, callback) {
            return updateFeed(feed, callback, function(feed, feedElement) {
                feedElement.itemIndex = feed.itemIndex;
            });
        };

        this.updateFeedSuggestedTemplate = function(feed, callback) {
            return updateFeed(feed, callback, function(feed, feedElement) {
                feedElement.suggestedTemplate = feed.suggestedTemplate;
            });
        };
    })
    .factory('persistenceService', function(persistenceCfg, serverCommunicationService, localStorageService,
                                            logService, doPageElementsIdsMatch, doFeedsIdsMatch,
                                            feedSuggestedTemplateModifier) {
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

            var feedSuggestionsEventHandler = function(feeds) {
                return localStorageService.getExcludedFeeds(function(excludedFeeds) {
                    var filteredFeeds = _.filter(feeds, function(feed) {
                        return (excludedFeeds || []).indexOf(feed.feedId) < 0;
                    });
                    return feedsDiscovered(_.keyBy(filteredFeeds, _.curryRight(_.get, 2)('feedId')),
                        function(feedCollections) {
                            executeWrappedEventHandlerDescriptor('feedsSuggested', feedCollections);
                        });
                });
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
                    'allPageElementsDeleted': allPageElementsDeletedEventHandler,
                    'feedSuggestions': feedSuggestionsEventHandler},
                {'connectedToServer': connectedToServerEventHandler});

            var feedsDiscovered = function(feeds, callback) {
                if (angular.isObject(feeds)) {
                    logService.logDebug('Persistence: Discovered ' + _.keys(feeds).length + ' feeds from server');
                    return localStorageService.getSubscribedToFeeds(function(subscribedToFeeds) {
                        var partition = _.reduce(feeds, function(result, feed) {
                            var subscribedToFeed = _.find(subscribedToFeeds, _.curry(doFeedsIdsMatch, 2)(feed.feedId));
                            if (angular.isDefined(subscribedToFeed)) {
                                _.assign(feed, subscribedToFeed);
                                result[0].push(feed);
                            } else {
                                feed.itemIndex = 1;
                                result[1].push(feed);
                            }
                            feedSuggestedTemplateModifier.initFeedWithTemplate(feed);
                            return result;
                        }, [[],[]]);
                        var transform = _.curryRight(_.keyBy, 2)(_.curryRight(_.get, 2)('feedId'));
                        (callback || _.noop)(
                            {feeds: transform(partition[0]), suggestedFeeds: transform(partition[1])});
                    });
                }
            };

            var discoverFeeds = function(callback) {
                if (connection.isConnected) {
                    localStorageService.getExcludedFeeds(function(excludedFeeds) {
                        connection.discoverFeeds(excludedFeeds, _.curryRight(feedsDiscovered, 2)(callback), function() {
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

            this.fetchFeedItem = function(feed, fetchParams, persistChange) {
                if (connection.isConnected) {
                    connection.fetchFeedItem(fetchParams,
                        function(feedId, itemIndex, feedItem) {
                            if (persistChange) {
                                logService.logDebug('Persistence: Fetched "' + fetchParams.itemIndex +
                                    ' item from feed "' + fetchParams.feedId + ' -> persisting in local storage');
                                localStorageService.updateFeedItemIndex({feedId: feedId, itemIndex: itemIndex},
                                    function() {
                                        registerEventHandlerDescriptors['feedItemFetched'](feedId, itemIndex, feedItem);
                                    });
                            } else {
                                registerEventHandlerDescriptors['feedItemFetched'](feedId, itemIndex, feedItem);
                            }
                        },
                        function (status, message) {
                            logService.logDebug('Persistence: Fetching "' + fetchParams.itemIndex +
                                ' item from feed "' + fetchParams.feedId + ' has failed: ' + message);
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

            this.updateFeedSuggestedTemplate = function(feed) {
                logService.logDebug('Persistence: Updating feed ' + feed.feedId + ' suggestedTemplate in local storage');
                localStorageService.updateFeedSuggestedTemplate(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedSuggestedTemplateUpdated'], feed.feedId));
            };
        }

        return {
            'getPersistence': function(registerEventHandlerDescriptors) {
                return new Persistence(registerEventHandlerDescriptors);
            }
        }
    });
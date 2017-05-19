'use strict';

/**** Lawnchair-related angular services ****/

angular.module('noScaffold.persistenceServices', [])
    /* Return the persistence configuration */
    .constant('persistenceCfg', {
    })
    /* Wrapper to the lawnchair singleton */
    .factory('lawnchairService', function($window) {
        if (!angular.isDefined($window.Lawnchair)) {
            throw "Lawnchair library doesn't seem included in page";
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

        var clearCollection = function(feedCollectionKey, callback, mapFn) {
            getFeedCollection(feedCollectionKey, function(clearedElements) {
               saveFeedsCollection(feedCollectionKey, [], function() {
                   (callback || _.noop)(clearedElements);
               });
            }, mapFn);
        };

        this.excludeFeed = function(feed, callback) {
            return addFeedInCollection('excludedFeeds', _.pick(feed, ['feedId']), callback);
        };

        var excludedFeedMapFn = _.curryRight(_.get, 2)('feedId');
        this.getExcludedFeeds = function(callback) {
            return getFeedCollection('excludedFeeds', callback, excludedFeedMapFn);
        };

        this.clearExcludedFeeds = function(callback) {
            return clearCollection('excludedFeeds', callback, excludedFeedMapFn);
        };

        this.subscribeToFeed = function(feed, callback) {
            return addFeedInCollection('subscribedFeeds',
                _.pick(feed,
                    ['feedId', 'feedDetails', 'itemIndex', 'directFetchMode',
                        'suggestedPresentation', 'originalSuggestedPresentation']),
                    callback);
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
                _.assign(feedElement, _.pick(feed, ['itemIndex']));
            });
        };

        this.updateFeedSuggestedPresentation = function(feed, callback) {
            return updateFeed(feed, callback, function(feed, feedElement) {
                _.assign(feedElement, _.pick(feed, ['suggestedPresentation']));
            });
        };

        this.updateFeedDetails = function(feed, callback) {
            return updateFeed(feed, callback, function (feed, feedElement) {
                _.assign(feedElement, _.pick(feed, ['feedDetails', 'directFetchMode']));
            });
        };
    })
    .factory('persistenceService', function(persistenceCfg, serverCommunicationService, localStorageService,
                                            logService, doFeedsIdsMatch, feedSuggestedTemplateModifier) {
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
                {'feedSuggestions': feedSuggestionsEventHandler},
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
                            if (!_.isBoolean(feed.directFetchMode)) {
                                feed.directFetchMode = false;
                            }
                            feedSuggestedTemplateModifier.initFeedWithTemplate(feed);
                            return result;
                        }, [[],[]]);

                        var localStorageOnlySubscribedFeeds = _.filter(subscribedToFeeds, function(subscribedFeed) {
                            return !angular.isDefined(
                                _.find(partition[0], _.curry(doFeedsIdsMatch, 2)(subscribedFeed.feedId)));
                        });
                        _.forEach(localStorageOnlySubscribedFeeds, function(subscribedFeed) {
                            subscribedFeed.directFetchMode = true;
                            feedSuggestedTemplateModifier.initFeedWithTemplate(subscribedFeed);
                        });
                        partition[0] = _.concat(partition[0], localStorageOnlySubscribedFeeds);

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

            this.discoverSpecificFeeds = function(feedIds) {
                logService.logDebug('Persistence: Discovering specific feeds ' + feedIds + ' from server');
                connection.discoverSpecificFeeds(feedIds, _.curryRight(feedsDiscovered, 2)(function(feeds) {
                    executeWrappedEventHandlerDescriptor('allFeedsDiscovered', feeds);
                }), function() {
                    logService.logError('Persistence: error occurred while discovering feed ' + feedIds + ' from server');
                });
            };

            this.fetchFeedItem = function(feed, fetchParams, persistChange, refreshDisplay) {
                connection.fetchFeedItem(feed, fetchParams,
                    function(feedId, itemIndex, feedItem) {
                        if (persistChange) {
                            logService.logDebug('Persistence: Fetched "' + fetchParams.itemIndex +
                                ' item from feed "' + feed.feedId + ' -> persisting in local storage');
                            localStorageService.updateFeedItemIndex({feedId: feedId, itemIndex: itemIndex},
                                function() {
                                    registerEventHandlerDescriptors['feedItemFetched'](
                                        feedId, itemIndex, feedItem, refreshDisplay);
                                });
                        } else {
                            registerEventHandlerDescriptors['feedItemFetched'](
                                feedId, itemIndex, feedItem, refreshDisplay);
                        }
                    },
                    function (status, message) {
                        logService.logDebug('Persistence: Fetching "' + fetchParams.itemIndex +
                            ' item from feed "' + feed.feedId + ' has failed: ' + message);
                    });
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

            this.clearExcludedFeeds = function() {
                logService.logDebug('Persistence: Clearing excluded feeds from local storage');
                localStorageService.clearExcludedFeeds(registerEventHandlerDescriptors['excludedFeedsCleared']);
            };

            this.updateFeedSuggestedPresentation = function(feed) {
                logService.logDebug('Persistence: Updating feed ' + feed.feedId +
                    ' suggestedPresentation in local storage');
                localStorageService.updateFeedSuggestedPresentation(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedSuggestedPresentationUpdated'], feed));
            };

            this.updateFeedDetails = function(feed) {
                logService.logDebug('Persistence: Updating feed ' + feed.feedId + ' details in local storage');
                localStorageService.updateFeedDetails(feed,
                    feedCallbackWrapper(registerEventHandlerDescriptors['feedDetailsUpdated'], feed));
            };
        }

        return {
            'getPersistence': function(registerEventHandlerDescriptors) {
                return new Persistence(registerEventHandlerDescriptors);
            }
        }
    });
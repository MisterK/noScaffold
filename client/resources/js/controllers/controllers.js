'use strict';

/**** Angular controllers ****/

angular.module('noScaffold.controllers', [])
    .controller('NoScaffoldController', function($scope, persistenceService, logService, doFeedsIdsMatch,
                                                 feedSuggestedTemplateModifier) {
        $scope.feeds = {};
        $scope.suggestedFeeds = {};
        $scope.selectedFeed = undefined;
        $scope.selectedFeedForSuggestedPresentationEdit = undefined;
        var configFetchParams = {
            'suburb': 'Richmond',
            'suburbId': '8ece3e33-d411-4ae8-b479-f6bd6c0f403f'
        };

        var clearPageElementSelection = function() {
            var previouslySelectedFeed = angular.isObject($scope.selectedFeed) ?
                $scope.selectedFeed : undefined;
            $scope.selectedFeed = undefined;
            return previouslySelectedFeed;
        };

        var clearFeedSelectionAndRefresh = function() {
            var previouslySelectedFeed = clearPageElementSelection();
            if (angular.isObject(previouslySelectedFeed)) {
                requireFeedDisplayRefresh(previouslySelectedFeed);
            }
        };

        var selectFeed = function(feed) {
            clearFeedSelectionAndRefresh();
            $scope.selectedFeed = feed;
        };

        $scope.selectFeedAndRefresh = function(feed) {
            selectFeed(feed);
            requireFeedDisplayRefresh(feed);
        };

        var isFeedSelectedId = function(feedId) {
            return angular.isDefined($scope.selectedFeed)
                && doFeedsIdsMatch(feedId, $scope.selectedFeed);
        };

        $scope.isFeedSelected = function(feed) {
            return isFeedSelectedId(feed.feedId);
        };

        $scope.subscribeToFeed = function(feed) {
            requireFeedRemoval(feed);
            delete $scope.suggestedFeeds[feed.feedId];
            persistence.subscribeToFeed(feed);
        };

        $scope.unsubscribeFromFeed = function(feed) {
            requireFeedRemoval(feed);
            delete $scope.feeds[feed.feedId];
            persistence.unsubscribeFromFeed(feed);
        };

        $scope.excludeFeed = function(feed) {
            persistence.excludeFeed(feed);
        };

        var fetchFeedItem = function(feed, persistChange, itemIndexFn) {
            var itemIndex = itemIndexFn(feed);
            if (angular.isNumber(itemIndex)) {
                persistence.fetchFeedItem(feed,
                    _.assign({feedId: feed.feedId, itemIndex: itemIndex}, configFetchParams),
                    persistChange);
            }
        };

        $scope.nextFeedItem = function(feed, persistChange) {
            return fetchFeedItem(feed, persistChange, function(feed) { return feed.itemIndex + 1; });
        };

        $scope.previousFeedItem = function(feed, persistChange) {
            return fetchFeedItem(feed, persistChange,
                function(feed) { return feed.itemIndex > 1 ? feed.itemIndex - 1 : undefined; });
        };

        $scope.resetFeedSuggestedPresentation = function(feed) {
            logService.logDebug('Resetting template for feed ' + feed.feedId);
            persistence.updateFeedSuggestedPresentation(
                feedSuggestedTemplateModifier.resetFeedSuggestedPresentation(feed));
            feed.previousItem = feed.currentItem;
            requireFeedItemRefresh(feed);
        };

        $scope.editFeedSuggestedPresentation = function(feed) {
            $scope.selectedFeedForSuggestedPresentationEdit = feed;
        };

        $scope.updateFeedSuggestedPresentation = function(feedSuggestedPresentation) {
            if (angular.isObject($scope.selectedFeedForSuggestedPresentationEdit)) {
                logService.logDebug('Setting suggestedPresentation for feed ' +
                    $scope.selectedFeedForSuggestedPresentationEdit.feedId);
                persistence.updateFeedSuggestedPresentation(
                    feedSuggestedTemplateModifier.updateFeedSuggestedPresentation(
                        $scope.selectedFeedForSuggestedPresentationEdit, feedSuggestedPresentation));
                $scope.selectedFeedForSuggestedPresentationEdit.previousItem =
                    $scope.selectedFeedForSuggestedPresentationEdit.currentItem;
                requireFeedItemRefresh($scope.selectedFeedForSuggestedPresentationEdit);
            }
        };

        $scope.updateFeedSuggestedTemplate = function(feed) {
            logService.logDebug('Persisting template change for feed ' + feed.feedId);
            persistence.updateFeedSuggestedPresentation(feed);
        };

        //Setup persistence
        var pageElementSavedEventHandler = function(savedPageElement) {
            pageElementsFactory.augmentPageElement(savedPageElement);
            var matchSavedElementId = _.partial(doPageElementsIdsMatch, savedPageElement);
            var indexOfSavedPageElement = _.findIndex($scope.pageElements[savedPageElement.pageElementType],
                matchSavedElementId);
            if (indexOfSavedPageElement < 0) {
                logService.logDebug('Adding element "' + savedPageElement.pageElementId +
                    '" of type ' + savedPageElement.pageElementType + ' received from server');
                $scope.pageElements[savedPageElement.pageElementType].push(savedPageElement);
            } else {
                logService.logDebug('Updating element "' + savedPageElement.pageElementId +
                    '" of type ' + savedPageElement.pageElementType + ' received from server');
                $scope.pageElements[savedPageElement.pageElementType][indexOfSavedPageElement] = savedPageElement;
                if ($scope.isPageElementSelected(savedPageElement)) {
                    $scope.selectPageElement(savedPageElement); //Re-select it to update edit dialog
                }
            }
        };
        var feedsDiscoveredEventHandler = function(feedCollections) {
            if (!angular.isObject(feedCollections)
                || ((!angular.isObject(feedCollections['feeds']) || _.keys(feedCollections['feeds']).length == 0)
                && (!angular.isObject(feedCollections['suggestedFeeds'])
                    || _.keys(feedCollections['suggestedFeeds']).length == 0))) {
                logService.logDebug('No feeds received from server');
                return;
            }
            //TODO merge (and do not refresh) instead of replace if feed already exist, otherwise double item display
            _.assign($scope.feeds, feedCollections['feeds']);
            _.assign($scope.suggestedFeeds, feedCollections['suggestedFeeds']);
            logService.logDebug('Fetching first item of each ' + (_.keys(feedCollections['feeds']).length +
                _.keys(feedCollections['suggestedFeeds']).length) + ' feed received from server');
            _.values(feedCollections).forEach(function(feedCollection) {
                _.forEach(feedCollection, function(feed) {
                    persistence.fetchFeedItem(feed,
                        _.assign({feedId: feed.feedId, itemIndex: feed.itemIndex || 1}, configFetchParams),
                        false);
                });
            });
            requireAllFeedsDisplayAdding();
        };
        var findFeed = function(feedId) {
            return $scope.feeds[feedId] || $scope.suggestedFeeds[feedId];
        };
        var feedItemFetchedEventHandler = function(feedId, itemIndex, feedItem) {
            var feed = findFeed(feedId);
            if (_.isUndefined(feed)) {
                logService.logDebug('Feed ' + feedId + ' not found!');
                return;
            }
            feedItem.itemIndex = itemIndex;
            feedItem.feedId = feedId;
            feed.itemIndex = itemIndex;
            feed.previousItem = feed.currentItem;
            feed.currentItem = feedItem;
            requireFeedItemRefresh(feed);
            logService.logDebug('Item ' + itemIndex + ' from feed "' + feedId + '" fetched!')
        };
        var feedSubscribedEventHandler = function(feed) {
            $scope.feeds[feed.feedId] = feed;
            requireFeedDisplayAdding(feed);
        };
        var feedUnsubscribedEventHandler = function(feed) {
            $scope.suggestedFeeds[feed.feedId] = feed;
            requireFeedDisplayAdding(feed);
        };
        var feedExcludedEventHandler = function(feedId) {
            var feed = findFeed(feedId);
            if (_.isUndefined(feed)) {
                logService.logDebug('Feed ' + feedId + ' not found!');
                return;
            }
            requireFeedRemoval(feed);
        };
        var augmentWithScopeApplyWrapper = function(eventHandlerCallback) {
          eventHandlerCallback.scopeApplyWrapper = function() {
              var passedArguments = arguments;
              $scope.$apply(function() {
                  eventHandlerCallback.apply(eventHandlerCallback, passedArguments);
              });
          };
          return eventHandlerCallback;
        };
        var persistence = persistenceService.getPersistence(
            {'pageElementSaved': augmentWithScopeApplyWrapper(pageElementSavedEventHandler),
                'allFeedsDiscovered': augmentWithScopeApplyWrapper(feedsDiscoveredEventHandler),
                'feedsSuggested': augmentWithScopeApplyWrapper(feedsDiscoveredEventHandler),
                'feedItemFetched': augmentWithScopeApplyWrapper(feedItemFetchedEventHandler),
                'feedSubscribed': augmentWithScopeApplyWrapper(feedSubscribedEventHandler),
                'feedUnsubscribed': augmentWithScopeApplyWrapper(feedUnsubscribedEventHandler),
                'feedExcluded': augmentWithScopeApplyWrapper(feedExcludedEventHandler)});

        var requireFeedDisplayAdding = function(feedToAdd) {
            $scope.$broadcast('feedAdded', feedToAdd);
        };

        var requireAllFeedsDisplayAdding = function() {
            requireFeedDisplayAdding();
        };

        var requireFeedItemRefresh = function(feedToRefresh) {
            $scope.$broadcast('feedItemRefresh', feedToRefresh);
        };

        var requireFeedDisplayRefresh = function(feedToRefresh) {
            $scope.$broadcast('feedRefresh', feedToRefresh);
        };

        var requireFeedRemoval = function(feedToRemove) {
            $scope.$broadcast('feedRemove', feedToRemove);
        };
    });
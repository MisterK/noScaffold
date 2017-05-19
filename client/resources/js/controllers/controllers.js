'use strict';

/**** Angular controllers ****/

angular.module('noScaffold.controllers', [])
    .controller('NoScaffoldController', function($scope, persistenceService, logService, doFeedsIdsMatch,
                                                 feedSuggestedTemplateModifier, dataCfg) {
        $scope.feeds = {};
        $scope.suggestedFeeds = {};
        $scope.selectedFeed = undefined;
        $scope.selectedFeedForSuggestedPresentationEdit = undefined;
        $scope.selectedFeedForEdit = undefined;
        $scope.showAddFeedDialog = false;

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
                    _.assign({itemIndex: itemIndex}, feed.feedDetails.fetchParams),
                    persistChange, true);
            }
        };

        $scope.nextFeedItem = function(feed, persistChange) {
            return fetchFeedItem(feed, persistChange, function(feed) { return feed.itemIndex + 1; });
        };

        $scope.previousFeedItem = function(feed, persistChange) {
            return fetchFeedItem(feed, persistChange,
                function(feed) { return feed.itemIndex > 1 ? feed.itemIndex - 1 : undefined; });
        };

        $scope.firstFeedItem = function(feed, persistChange) {
            return fetchFeedItem(feed, persistChange, function() { return 1; });
        };

        $scope.resetFeedSuggestedPresentation = function(feed, skipVisualRefresh) {
            logService.logDebug('Resetting template for feed ' + feed.feedId);
            persistence.updateFeedSuggestedPresentation(
                feedSuggestedTemplateModifier.resetFeedSuggestedPresentation(feed));
            if (!_.isBoolean(skipVisualRefresh) || skipVisualRefresh != true) {
                feed.previousItem = feed.currentItem;
                requireFeedItemRefresh(feed);
            }
        };

        $scope.displayEditFeedSuggestedPresentationDialog = function(feed) {
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

        $scope.clearAllFeeds = function() {
            _.values($scope.feeds).forEach(function(feed) {
                $scope.unsubscribeFromFeed(feed);
                $scope.resetFeedSuggestedPresentation(feed, true);
                $scope.firstFeedItem(feed, true);
            });
            persistence.clearExcludedFeeds();
        };

        $scope.displayAddFeedDialog = function() {
            $scope.showAddFeedDialog = true;
        };

        $scope.addFeed = function(feedTemplate) {
            if (findFeed(feedTemplate.feedId)) {
                logService.logError('Feed with id ' + feedTemplate.feedId + ' already exists...');
                return;
            }

            var feed = {};
            _.assign(feed, feedTemplate);
            feed.feedDetails.fetchParams = JSON.parse(feed.feedDetails.fetchParams || '{}');
            feed.itemIndex = 1;
            feed.suggestedPresentation = {};
            feed.directFetchMode = true;

            var feedSuggestedPresentation = {
                template: dataCfg.feedSuggestedPresentation.placeholderValues.template,
                cssStyle: dataCfg.feedSuggestedPresentation.placeholderValues.cssStyle,
                dataSchema: dataCfg.feedSuggestedPresentation.placeholderValues.dataSchema
            };

            feedSuggestedTemplateModifier.updateFeedSuggestedPresentation(feed, feedSuggestedPresentation);
            feedSuggestedTemplateModifier.initFeedWithTemplate(feed);
            persistence.subscribeToFeed(feed);
            persistence.fetchFeedItem(feed,
                _.assign({itemIndex: feed.itemIndex}, feed.feedDetails.fetchParams),
                false, true);
        };

        $scope.displayEditFeedDialog = function(feed) {
            $scope.selectedFeedForEdit = feed;
        };

        $scope.updateFeedDetails = function(feedDetails) {
            if (angular.isObject($scope.selectedFeedForEdit)) {
                logService.logDebug('Setting details for feed ' + $scope.selectedFeedForEdit.feedId);
                if ($scope.selectedFeedForEdit.feedDetails.templateUrl != feedDetails.templateUrl) {
                    $scope.selectedFeedForEdit.directFetchMode = true;
                }
                _.assign($scope.selectedFeedForEdit.feedDetails,
                    _.pick(feedDetails, ['feedName', 'templateUrl', 'fetchParams']));
                $scope.selectedFeedForEdit.feedDetails.fetchParams =
                    JSON.parse($scope.selectedFeedForEdit.feedDetails.fetchParams || '{}');
                persistence.updateFeedDetails($scope.selectedFeedForEdit);
                persistence.fetchFeedItem($scope.selectedFeedForEdit,
                    _.assign({itemIndex: $scope.selectedFeedForEdit.itemIndex},
                        $scope.selectedFeedForEdit.feedDetails.fetchParams),
                    false, false);
                requireFeedRedraw($scope.selectedFeedForEdit);
            }
        };

        $scope.cloneFeed = function(feed) {
            var newFeed = _.cloneDeep(feed);
            newFeed.feedId = feedSuggestedTemplateModifier.getNewUUID();
            newFeed.itemIndex = 1;
            newFeed.feedDetails.feedName += " - Clone";
            newFeed.directFetchMode = true;
            persistence.subscribeToFeed(newFeed);
            persistence.fetchFeedItem(newFeed,
                _.assign({itemIndex: newFeed.itemIndex}, newFeed.feedDetails.fetchParams),
                false, false);
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
            _.keys(feedCollections).forEach(function(collectionKey) {
                var splitKnownFeeds = _.partition(feedCollections[collectionKey], function(feed) {
                    return !angular.isObject($scope[collectionKey][feed.feedId]);
                });
                logService.logDebug(_.keys(feedCollections[collectionKey]).length + ' ' +
                    collectionKey + ' retrieved, ' + splitKnownFeeds[0].length + ' of which are new.');
                _.forEach(splitKnownFeeds[0], function(feed) {
                    $scope[collectionKey][feed.feedId] = feed;
                    requireFeedDisplayAdding(feed);
                    logService.logDebug('Fetching first item of feed ' + feed.feedId + ' received from server');
                    persistence.fetchFeedItem(feed,
                        _.assign({itemIndex: feed.itemIndex || 1}, feed.feedDetails.fetchParams),
                        false, true);
                });
                //TODO Question: is there anything to do with the known feeds (splitKnownFeeds[1])?
            });
        };
        var findFeed = function(feedId) {
            return $scope.feeds[feedId] || $scope.suggestedFeeds[feedId];
        };
        var feedItemFetchedEventHandler = function(feedId, itemIndex, feedItem, refreshDisplay) {
            var feed = findFeed(feedId);
            if (_.isUndefined(feed)) {
                logService.logDebug('Feed ' + feedId + ' not found!');
                return;
            }
            feedItem.itemIndex = itemIndex;
            feedItem.feedId = feedId;
            feedItem.itemId = feedSuggestedTemplateModifier.getNewUUID();
            feed.itemIndex = itemIndex;
            feed.previousItem = feed.currentItem;
            feed.currentItem = feedItem;
            if (refreshDisplay !== false) {
                requireFeedItemRefresh(feed);
            }
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
        var excludedFeedsClearedEventHandler = function(clearedFeedIds) {
            persistence.discoverSpecificFeeds(clearedFeedIds);
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
                'feedExcluded': augmentWithScopeApplyWrapper(feedExcludedEventHandler),
                'excludedFeedsCleared': augmentWithScopeApplyWrapper(excludedFeedsClearedEventHandler)});

        var requireFeedDisplayAdding = function(feedToAdd) {
            $scope.$broadcast('feedAdded', feedToAdd);
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

        var requireFeedRedraw = function(feedToRedraw) {
            $scope.$broadcast('feedRedraw', feedToRedraw); //TODO Beurk: feed display update instead of full redraw?
        };
    });
'use strict';

/**** Board directive ****/

angular.module('noScaffold.directives', [])
    /* Directive: noScaffoldFeedCollection
     * Goal: Creates the noScaffoldFeedCollection graphics
     * Usage: <no-scaffold-feed-collection collection-name="suggestedFeeds"></no-scaffold-feed-collection>
     * Dependencies:
     *  - d3Service: to access the d3 library object
     * Description: Creates the main noScaffoldFeedCollection with D3
     */
    .directive('noScaffoldFeedCollection', function(presentationCfg, dataCfg, d3Service,
                                        d3ComponentFactoryService, d3TransitionsService,
                                                    feedSuggestedTemplateModifier) {
        var getFeedCssSelection = function(feedSelection) {
            var selectionByFeedId = angular.isObject(feedSelection.feed)
                ? feedSelection.feed.feedId : feedSelection.feedId;
            if (angular.isString(selectionByFeedId)) {
                return "[id='" + selectionByFeedId + "']";
            } else {
                return ".feed";
            }
        };

        function selectFeeds(parentElement, cssSelection, data) {
            return parentElement.selectAll(cssSelection)
                .data(data, function(d) { return d.feedId; });
        }

        var scopeApply = function(scope, fn) {
            return function() {
                var args = arguments;
                scope.$apply(function() {
                    fn.apply(this, args);
                });
            }
        };

        var drawFeeds = function (scope, isSubscribedFeeds, parentElement, cssSelection, data) {
            var feedElements = selectFeeds(parentElement, cssSelection, data);

            var callbacks = {
                'isSelected': scope.isFeedSelected,
                'feedUnsubscribeButtonClicked': scopeApply(scope,
                    isSubscribedFeeds ? scope.unsubscribeFromFeed : scope.excludeFeed),
                'feedNextItemButtonClicked': scopeApply(scope, function(feed) {
                    return scope.nextFeedItem(feed, isSubscribedFeeds);
                })
            };
            if (!isSubscribedFeeds) {
                callbacks['feedSubscribeButtonClicked'] = scopeApply(scope, scope.subscribeToFeed)
            }
            return d3TransitionsService.fadeIn(
                d3ComponentFactoryService.appendFeeds(feedElements, callbacks, feedItemWiringFn(scope))
                    .on('click', scopeApply(scope, scope.selectFeedAndRefresh),
                presentationCfg.animations.feeds, presentationCfg.animations.longDuration));
        };

        var reDrawFeeds = function(scope, parentElement, cssSelection, data) {
            var feedElements = selectFeeds(parentElement, cssSelection, data);

            d3ComponentFactoryService.updateFeeds(feedElements, {'isSelected': scope.isFeedSelected});
        };

        var feedItemWiringFn = function(scope) {
            return function(feedItemElement) {
                return feedItemElement
                    /*.on('click', function(d) {
                     scope.$apply(function() {
                     scope.selectFeedAndRefresh(feed);
                     });
                     })*/;
            };
        };

        var drawFeedItem = function(scope, isSubscribedFeeds, parentElement, cssSelection, feed) {
            var feedElements = parentElement.selectAll(cssSelection);
            var callbacks = {
                'feedItemLineRemoveButtonClicked': isSubscribedFeeds ?
                    scopeApply(scope, function (feed, lineIndex) {
                        return scope.updateFeedSuggestedTemplate(
                            feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex));
                    }) :
                    function (feed, lineIndex) {
                        return feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex);
                    }
            };
            return d3ComponentFactoryService.updateFeedItem(feedElements, feedItemWiringFn(scope), callbacks);
        };

        var removeFeed = function(scope, parentElement, cssSelection, data) {
            var feeds = selectFeeds(parentElement, cssSelection, data).exit();
            d3TransitionsService.fadeOutAndRemove(feeds, presentationCfg.animations.feeds,
                presentationCfg.animations.veryLongDuration);
        };

        return {
            restrict: 'E',
            template: '<div class="noScaffoldFeedCollection"></div>',
            replace: true,
            link: function(scope, element, attributes) {
                var d3 = d3Service.d3;
                var collectionName = attributes['collectionName'];
                var isSubscribedFeeds = collectionName == 'feeds';
                var rootElement = d3.select(element[0]);

                rootElement
                    .append('div')
                    .attr('class', 'noScaffoldFeedCollectionTitle')
                    .text(collectionName);

                scope.$on('feedAdded', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collectionName][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    var data = angular.isObject(feed) ? [feed] : _.values(scope[collectionName]);
                    drawFeeds(scope, isSubscribedFeeds, rootElement, cssSelection, data);
                });

                scope.$on('feedRefresh', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collectionName][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    var data = angular.isObject(feed) ? [feed] : _.values(scope[collectionName]);
                    reDrawFeeds(scope, rootElement, cssSelection, data);
                });

                scope.$on('feedItemRefresh', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collectionName][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    drawFeedItem(scope, isSubscribedFeeds, rootElement, cssSelection, feed);
                });

                scope.$on('feedRemove', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collectionName][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    removeFeed(scope, rootElement, cssSelection, feed);
                });
            }
        }
    });

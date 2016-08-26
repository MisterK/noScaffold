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

        var drawFeeds = function(scope, collection, parentElement, cssSelection, data) {
            var feedElements = selectFeeds(parentElement, cssSelection, data);

            var callbacks = {
                'isSelected': scope.isFeedSelected,
                'feedUnsubscribeButtonClicked': scopeApply(scope,
                    collection.isSubscribedFeeds ? scope.unsubscribeFromFeed : scope.excludeFeed),
                'feedNextItemButtonClicked': scopeApply(scope, function(feed) {
                    return scope.nextFeedItem(feed, collection.isSubscribedFeeds);
                }),
                'feedItemLineRemoveButtonClicked': collection.isSubscribedFeeds ?
                    scopeApply(scope, function (feed, lineIndex) {
                        return scope.updateFeedSuggestedTemplate(
                            feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex));
                    }) :
                    function (feed, lineIndex) {
                        return feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex);
                    }
            };
            if (!collection.isSubscribedFeeds) {
                callbacks['feedSubscribeButtonClicked'] = scopeApply(scope, scope.subscribeToFeed)
            }
            return d3TransitionsService.fadeIn(
                d3ComponentFactoryService.appendFeeds(feedElements, callbacks, feedItemWiringFn(scope))
                    .on('click', scopeApply(scope, scope.selectFeedAndRefresh),
                presentationCfg.animations.feeds, presentationCfg.animations.longDuration));
        };

        var reDrawFeeds = function(scope, collection, parentElement, cssSelection, data) {
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

        var drawFeedItem = function(scope, collection, parentElement, cssSelection, data) {
            var feedElements = parentElement.selectAll(cssSelection);
            var callbacks = {
                'feedItemLineRemoveButtonClicked': collection.isSubscribedFeeds ?
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

        var removeFeed = function(scope, collection, parentElement, cssSelection, data) {
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
                var collection = {
                    name: attributes['collectionName'],
                    title: attributes['collectionTitle'],
                    isSubscribedFeeds: attributes['collectionName'] == 'feeds'
                };
                var rootElement = d3.select(element[0]);

                rootElement
                    .append('div')
                    .attr('class', 'noScaffoldFeedCollectionTitle')
                    .text(collection.title);

                var handleEvent = function(eventHandlerFn) {
                    return function(event, feed) {
                        if (angular.isObject(feed) && !angular.isObject(scope[collection.name][feed.feedId])) {
                            return;
                        }
                        var cssSelection = getFeedCssSelection({feed: feed});
                        var data = angular.isObject(feed) ? [feed] : _.values(scope[collection.name]);
                        eventHandlerFn(scope, collection, rootElement, cssSelection, data);
                    };
                };

                scope.$on('feedAdded', handleEvent(drawFeeds));

                scope.$on('feedRefresh', handleEvent(reDrawFeeds));

                scope.$on('feedItemRefresh', handleEvent(drawFeedItem));

                scope.$on('feedRemove', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collection.name][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    removeFeed(scope, collection, rootElement, cssSelection, feed);
                });
            }
        }
    });

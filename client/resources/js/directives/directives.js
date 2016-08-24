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
                                        d3ComponentFactoryService, d3TransitionsService) {
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

        var drawFeeds = function(scope, parentElement, cssSelection, data) {
            var feeds = selectFeeds(parentElement, cssSelection, data).enter();

            d3TransitionsService.fadeIn(
                d3ComponentFactoryService.appendFeeds(feeds, scope.isFeedSelected)
                    .on('click', function(d) {
                        scope.$apply(function() {
                            scope.selectFeedAndRefresh(d);
                        });
                    }),
                presentationCfg.animations.feeds, presentationCfg.animations.longDuration);
        };

        var reDrawFeeds = function(scope, parentElement, cssSelection, data) {
            var feeds = selectFeeds(parentElement, cssSelection, data);

            d3ComponentFactoryService.updateFeeds(feeds, scope.isFeedSelected);
        };

        var drawFeedItem = function(scope, parentElement, cssSelection, feed) {
            var feeds = parentElement.selectAll(cssSelection);

            d3ComponentFactoryService.updateFeedItem(feeds, function(feedItemElement) {
                return feedItemElement
                    /*.on('click', function(d) {
                        scope.$apply(function() {
                            scope.selectFeedAndRefresh(feed);
                        });
                    })*/;
            });
        };

        return {
            restrict: 'E',
            template: '<div class="noScaffoldFeedCollection"></div>',
            replace: true,
            link: function(scope, element, attributes) {
                var d3 = d3Service.d3;
                var collectionName = attributes['collectionName'];
                var rootElement = d3.select(element[0]);

                rootElement
                    .append('div')
                    .attr('class', 'noScaffoldFeedCollectionTitle')
                    .text(collectionName);

                scope.$on('feedAdded', function(event, feed) {
                    var cssSelection = getFeedCssSelection({feed: feed});
                    var data = angular.isObject(feed) ? [feed] : _.values(scope[collectionName]);
                    drawFeeds(scope, rootElement, cssSelection, data);
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
                    drawFeedItem(scope, rootElement, cssSelection, feed);
                });
            }
        }
    });

'use strict';

/**** D3-related angular services ****/

angular.module('noScaffold.d3AngularServices', [])
    /* Return the presentation layer configuration */
    .constant('presentationCfg', {
        'animations': {
            'feeds': true,
            'longDuration': 1000,
            'shortDuration': 500,
            'veryLongDuration': 2000
        },
        "selectedFeedBgColor": 'yellow',
        "defaultFeedBgColor": 'white'
    })
    /* Wrapper to the D3 singleton */
    .factory('d3Service', function($window) {
        if (!angular.isDefined($window.d3)) {
            throw "D3 library doesn't seem included in page"
        }
        return {d3: $window.d3};
    })
    /* Service to build and append D3 elements */
    .service('d3ComponentFactoryService', function(presentationCfg, d3TransitionsService) {
        var thisService = this;

        this.appendFeeds = function(d3Elements, callbacks, feedItemWiringFn) {
            var resultingD3Element = d3Elements.enter()
                .append('div')
                    .attr('id', getter('feedId'))
                    .attr('class', 'feed');
            resultingD3Element
                .append('div')
                    .attr('class', 'feedTitle')
                    .text(getter('feedId'));
            resultingD3Element
                .append('div')
                    .attr('class', 'feedButton feedRemoveButton')
                    .text('X')
                    .on('click', (callbacks['feedUnsubscribeButtonClicked'] || _.noop));
            if (callbacks['feedSubscribeButtonClicked']) {
                resultingD3Element
                    .append('div')
                    .attr('class', 'feedButton feedSubscribeButton')
                    .text('♥')
                    .on('click', (callbacks['feedSubscribeButtonClicked'] || _.noop));
            }
            resultingD3Element
                .append('div')
                .attr('class', 'feedButton feedNextItemButton')
                .text('⇒')
                .on('click', (callbacks['feedNextItemButtonClicked'] || _.noop));

            //TODO

            thisService.updateFeeds(resultingD3Element, callbacks);
            return thisService.updateFeedItem(d3Elements, feedItemWiringFn);
        };

        this.updateFeeds = function(d3Elements, callbacks) {
            return d3Elements.each(function(feed) {
                var thisElement = d3.select(this);

                //TODO

                return thisElement.style('background-color', function(feed) {
                    return (callbacks['isSelected'] || _.noop)(feed) ?
                        presentationCfg.selectedFeedBgColor : presentationCfg.defaultFeedBgColor;
                });
            });
        };

        this.updateFeedItem = function(d3Elements, wiringFn, callbacks) {
            return d3Elements.each(function(feed) {
                var thisElement = d3.select(this);

                //TODO
                if (angular.isObject(feed.previousItem)) {
                    d3TransitionsService.fadeOutAndRemove(
                        thisElement.select("[id='" + feed.previousItem.itemIndex + "']"),
                        presentationCfg.animations.feeds, presentationCfg.animations.longDuration);
                }
                if (angular.isObject(feed.currentItem)) {
                    if (!angular.isObject(feed.previousItem)) { // To avoid double refresh
                        feed.previousItem = feed.currentItem; //TODO find a better mechanism
                    }
                    var feedItemElement = thisElement
                        .append('div')
                        .attr('id', feed.itemIndex)
                        .attr('class', 'feedItem');
                    feedItemElement
                        .append('div')
                        .attr('class', 'feedItemTitle')
                        .text(function(feed) {
                           return 'Item ' + feed.itemIndex;
                        });
                    if (angular.isString(feed.suggestedTemplate)) {
                        var variablesExtrapolated = feed.suggestedTemplate.replace(/#\{([^\{]*)\}/g, function(match, group) {
                            return _.get(feed.currentItem, group.split('|||'), ' ');
                        });
                        var lines = variablesExtrapolated.split(/\n/);
                        _.forEach(lines, function(line, lineIndex) {
                            if (line.trim().length > 0) {
                                var feedItemLine = feedItemElement
                                    .append('div')
                                    .attr('class', 'feedItemLine');
                                feedItemLine
                                    .append('div')
                                    .attr('class', 'feedItemLineContent')
                                    .text(line);
                                feedItemLine
                                    .append('div')
                                    .attr('class', 'feedItemLineButton feedItemLineRemoveButton')
                                    .text('X')
                                    .on('click', function (d) {
                                        d3TransitionsService.fadeOutAndRemove(feedItemLine,
                                            presentationCfg.animations.feeds, presentationCfg.animations.shortDuration);
                                        (callbacks['feedItemLineRemoveButtonClicked'] || _.noop)(d, lineIndex);
                                    });
                            }
                        });
                        feedItemElement //TODO fix CSS and remove this
                            .append('div')
                            .attr('class', 'clearer')
                            .text(' ');
                    } else {
                        feedItemElement.text(JSON.stringify(feed.currentItem));
                    }
                    if (angular.isFunction(wiringFn)) {
                        feedItemElement = wiringFn(feedItemElement);
                    }
                    d3TransitionsService.fadeIn(
                        feedItemElement,
                        presentationCfg.animations.feeds, presentationCfg.animations.veryLongDuration);
                }

                return thisElement;
            });
        };
        var getter = function(propertyName) {
            return function(element) { return element[propertyName]; }
        };
    })
    /* Service to animate the adding and removing of D3 elements */
    .service('d3TransitionsService', function(presentationCfg) {
        this.fadeIn = function(d3Element, animate, duration, delayFn) {
            if (!angular.isNumber(duration)) {
                duration = presentationCfg.animations.shortDuration;
            }
            if (!angular.isDefined(delayFn)) {
                delayFn = function() { return 0; };
            }
            if (animate) {
                return d3Element
                    .style('opacity', 0)
                    .transition()
                        .style('opacity', 1)
                        .duration(duration)
                        .delay(delayFn);
            } else {
                return d3Element;
            }
        };

        this.fadeOutAndRemove = function(d3Element, animate, duration, delayFn, removeElementAtEnd) {
            if (!angular.isNumber(duration)) {
                duration = presentationCfg.animations.shortDuration;
            }
            if (!angular.isDefined(removeElementAtEnd)) {
                removeElementAtEnd = true;
            }
            if (!angular.isDefined(delayFn)) {
                delayFn = function() { return 0; };
            }
            if (animate) {
                return d3Element
                    .style('opacity', 1)
                    .transition()
                        .style('opacity', 0)
                        .duration(duration)
                        .delay(delayFn)
                        .each("end", function() {
                            if (removeElementAtEnd) {
                                d3.select(this).remove();
                            }
                        });
            } else {
                return d3Element.remove();
            }
        };
    });

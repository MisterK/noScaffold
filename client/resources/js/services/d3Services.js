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
    .service('d3ComponentFactoryService', function(presentationCfg, d3TransitionsService,
                                                   feedSuggestedTemplateModifier) {
        var thisService = this;

        this.appendFeeds = function(d3Elements, callbacks, feedItemWiringFn) {
            var resultingD3Element = d3Elements.enter()
                .append('div')
                    .attr('id', getter('feedId'))
                    .attr('class', 'feed');
            resultingD3Element
                .append('div')
                    .attr('class', 'feedTitle')
                    .text(getter('feedName'));
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
            resultingD3Element
                .append('div')
                .attr('class', 'feedButton feedPreviousItemButton')
                .text('⇐')
                .on('click', (callbacks['feedPreviousItemButtonClicked'] || _.noop));
            resultingD3Element
                .append('div')
                .attr('class', 'feedButton feedFirstItemButton')
                .text('⇐⇐')
                .on('click', (callbacks['feedFirstItemButtonClicked'] || _.noop));
            resultingD3Element
                .append('div')
                .attr('class', 'feedButton feedResetSuggestedPresentationButton')
                .text('↻')
                .on('click', (callbacks['feedResetSuggestedPresentationButtonClicked'] || _.noop));
            resultingD3Element
                .append('div')
                .attr('class', 'feedButton feedEditSuggestedPresentationButton')
                .text('Ⓢ')
                .on('click', (callbacks['feedEditSuggestedPresentationButtonClicked'] || _.noop));

            //TODO Other feed buttons?

            thisService.updateFeeds(resultingD3Element, callbacks);
            return thisService.updateFeedItem(d3Elements, feedItemWiringFn, callbacks);
        };

        this.updateFeeds = function(d3Elements, callbacks) {
            return d3Elements.each(function(feed) {
                var thisElement = d3.select(this);

                //TODO Other refresh action?

                return thisElement.select('.feedTitle').style('background-color', function(feed) {
                    return (callbacks['isSelected'] || _.noop)(feed) ?
                        presentationCfg.selectedFeedBgColor : presentationCfg.defaultFeedBgColor;
                });
            });
        };

        this.updateFeedItem = function(d3Elements, wiringFn, callbacks) { //TODO make callbacks part of wiringFn instead?
            var thisService = this;
            return d3Elements.each(function(feed) {
                var thisElement = d3.select(this);

                //TODO Other display actions?
                if (angular.isObject(feed.previousItem)) {
                    d3TransitionsService.fadeOutAndRemove(
                        thisElement.select("[id='" + feed.feedId + '-feedItem' + feed.previousItem.itemIndex + "']"),
                        presentationCfg.animations.feeds, presentationCfg.animations.longDuration);
                    d3TransitionsService.fadeOutAndRemove(
                        thisElement.select("[id='" + feed.feedId + '-feedItem' + feed.previousItem.itemIndex + "-title']"),
                        presentationCfg.animations.feeds, presentationCfg.animations.longDuration);
                    thisElement.select("[id='" + feed.feedId + '-feedItem' + feed.previousItem.itemIndex + "-style']")
                        .remove();
                }
                if (angular.isObject(feed.currentItem)) {
                    if (!angular.isObject(feed.previousItem)) { // To avoid double refresh
                        feed.previousItem = feed.currentItem; //TODO find a better mechanism to avoid double refresh
                    }
                    if (angular.isString(feed.suggestedPresentation.cssStyle)) {
                        thisElement
                            .append('style')
                            .attr('id', feed.feedId + '-feedItem' + feed.itemIndex + '-style')
                            .attr('type', 'text/css')
                            .text(feedSuggestedTemplateModifier.extrapolateTemplateStringVariables(
                                feed.suggestedPresentation.dataSchema, feed.suggestedPresentation.cssStyle,
                                feed.currentItem));
                    }
                    thisElement
                        .append('div')
                        .attr('id', feed.feedId + '-feedItem' + feed.itemIndex + '-title')
                        .attr('class', 'feedItemTitle')
                        .text(function(feed) {
                            return 'Item ' + feed.itemIndex;
                        });
                    var feedItemElement = thisElement
                        .append('div')
                        .attr('id', feed.feedId + '-feedItem' + feed.itemIndex)
                        .attr('class', 'feedItem');
                    thisService.displayFeedItemContents(feedItemElement, feed, callbacks);
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

        this.displayFeedItemContents = function(feedItemElement, feed, callbacks) {
            if (angular.isArray(feed.tagArray)) {
                _.forEach(feed.tagArray, function(tag, tagIndex) {
                    var feedItemLine = feedItemElement
                        .append('div')
                        .attr('class', 'feedItemLine');
                    var feedItemLineContents = feedItemLine
                        .append('div')
                        .attr('class', 'feedItemLineContents');
                    var tagContents = feedSuggestedTemplateModifier.extrapolateTemplateStringVariables(
                            feed.suggestedPresentation.dataSchema, tag.tagContents, feed.currentItem);
                    var tagElement = feedItemLineContents
                        .append(tag.tagName)
                        .text(tagContents);
                    _.each(tag.tagAttributes, function(attrValue, attrName) {
                        var attributeValue = feedSuggestedTemplateModifier.extrapolateTemplateStringVariables(
                            feed.suggestedPresentation.dataSchema, attrValue, feed.currentItem);
                        if (attrName == 'class') {
                            attributeValue = 'feedItemLineContent ' + attributeValue;
                        }
                        tagElement.attr(attrName, attributeValue);
                    });


                    var feedItemLineActions = feedItemLine
                        .append('div')
                        .attr('class', 'feedItemLineActions');
                    var removeButton = feedItemLineActions
                        .append('div')
                        .attr('class', 'feedItemLineButton feedItemLineRemoveButton')
                        .style("opacity", 0)
                        .text('x')
                        .on('click', function (d) {
                            d3TransitionsService.fadeOutAndRemove(feedItemLine,
                                presentationCfg.animations.feeds, presentationCfg.animations.shortDuration);
                            (callbacks['feedItemLineRemoveButtonClicked'] || _.noop)(d, tagIndex);
                        });
                    feedItemLine.on('mouseover', function(d) {
                            d3TransitionsService.fadeIn(
                                removeButton,
                                presentationCfg.animations.feeds, presentationCfg.animations.shortDuration);
                        })
                        .on("mouseout", function(d) {
                            d3TransitionsService.fadeOutAndRemove(removeButton,
                                presentationCfg.animations.feeds, presentationCfg.animations.shortDuration,
                                undefined, false);
                        });
                });
                feedItemElement //TODO fix CSS and remove this
                    .append('div')
                    .attr('class', 'clearer')
                    .text(' ');
            } else {
                feedItemElement.text(JSON.stringify(feed.currentItem, null, 2));
            }
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

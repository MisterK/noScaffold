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
    .directive('noScaffoldFeedCollection', function(presentationCfg, d3Service,
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

        var drawFeeds = function(scope, collection, parentElement, cssSelection, data) {
            var feedElements = selectFeeds(parentElement, cssSelection, data);

            var callbacks = {
                'isSelected': scope.isFeedSelected,
                'feedUnsubscribeButtonClicked': scopeApply(scope,
                    collection.isSubscribedFeeds ? scope.unsubscribeFromFeed : scope.excludeFeed),
                'feedNextItemButtonClicked': scopeApply(scope, function(feed) {
                    return scope.nextFeedItem(feed, collection.isSubscribedFeeds);
                }),
                'feedPreviousItemButtonClicked': scopeApply(scope, function(feed) {
                    return scope.previousFeedItem(feed, collection.isSubscribedFeeds);
                }),
                'feedFirstItemButtonClicked': scopeApply(scope, function(feed) {
                    return scope.firstFeedItem(feed, collection.isSubscribedFeeds);
                }),
                'feedResetSuggestedPresentationButtonClicked': scopeApply(scope, scope.resetFeedSuggestedPresentation),
                'feedEditSuggestedPresentationButtonClicked': scopeApply(scope,
                    scope.displayEditFeedSuggestedPresentationDialog),
                'feedItemLineRemoveButtonClicked': collection.isSubscribedFeeds ?
                    scopeApply(scope, function (feed, lineIndex) {
                        return scope.updateFeedSuggestedTemplate(
                            feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex));
                    }) :
                    function (feed, lineIndex) {
                        return feedSuggestedTemplateModifier.feedItemLineRemoved(feed, lineIndex);
                    }
            };
            if (collection.isSubscribedFeeds) {
                callbacks['feedEditButtonClicked'] = scopeApply(scope, scope.displayEditFeedDialog);
            } else {
                callbacks['feedSubscribeButtonClicked'] = scopeApply(scope, scope.subscribeToFeed);
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
                presentationCfg.animations.longDuration);
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

                scope.$on('feedRedraw', function(event, feed) {
                    if (angular.isObject(feed) && !angular.isObject(scope[collection.name][feed.feedId])) {
                        return;
                    }
                    var cssSelection = getFeedCssSelection({feed: feed});
                    removeFeed(scope, collection, rootElement, cssSelection, feed);
                    setTimeout(function() { drawFeeds(scope, collection, rootElement, cssSelection, [feed]); },
                        presentationCfg.animations.longDuration + presentationCfg.animations.shortDuration);
                });
            }
        }
    })
    /* Directive: noScaffoldFeedSuggestedPresentationEditionDialog
     * Goal: Creates the noScaffold feed edition dialog
     * Usage: <no-scaffold-feed-suggested-presentation-edition-dialog selected-feed="selectedFeed" update-callback="updateFeed(feed)"></no-scaffold-feed-suggested-presentation-edition-dialog>
     * Params:
     * 		- directQueryService: to get an example of the feed's JSON input
     * Description: Creates the noScaffold feed edition dialog
     */
    .directive('noScaffoldFeedSuggestedPresentationEditionDialog', function(directQueryService, logService, d3Service,
                                                                            d3ComponentFactoryService, dataCfg) {
        return {
            restrict: 'E',
            templateUrl: 'feedSuggestedPresentationEditionDialogTemplate',
            replace: true,
            scope: {
                'selectedFeed': '=',
                'updateCallback': '&'
            },
            link: function(scope, element) {
                scope.feedSuggestedPresentation = {};
                var d3 = d3Service.d3;
                var rootElement = d3.select(element[0]).select('#showFeedJsonExampleTab');

                scope.resetModalDialogs = function() {
                    scope.hideFindFieldToAddToTemplateDialog();
                    scope.hidePickFieldNameToAddToTemplateDialog();
                };

                scope.$watch('selectedFeed', function(newValue, oldValue) {
                    if (angular.isObject(newValue) && newValue !== oldValue) {
                        _.assignWith(scope.feedSuggestedPresentation,
                            _.pick(newValue, ['suggestedPresentation']).suggestedPresentation,
                            function(objValue, srcValue) {
                                return angular.isObject(srcValue) ?
                                    JSON.stringify(srcValue, null, 2) : srcValue; });
                        scope.resetModalDialogs();
                    }
                });

                scope.handleSpecialKeys = function(target, event) {
                    if (event.altKey && event.keyCode == 402) {
                        event.preventDefault();
                        scope.caretPosition = event.target.selectionStart;
                        scope.showFindFieldToAddToTemplateDialog(target);
                    }
                };

                scope.closeDialog = function() {
                    scope.selectedFeed = undefined;
                };

                scope.saveChanges = function() {
                    if (angular.isFunction(scope.updateCallback)) {
                        scope.updateCallback({feedSuggestedPresentation: scope.feedSuggestedPresentation});
                        scope.closeDialog();
                    }
                };

                scope.showFindFieldToAddToTemplateDialog = function(target) {
                    scope.targetForFieldToAddToTemplate = target;
                    var configFetchParams = { //TODO replace by feed's fetch params
                        'suburb': 'Richmond',
                        'suburbId': '8ece3e33-d411-4ae8-b479-f6bd6c0f403f'
                    };
                    var fetchParams = _.assign({feedId: scope.selectedFeed.feedId, itemIndex: 1}, configFetchParams);
                    directQueryService.queryJsonApi(scope.selectedFeed, fetchParams,
                        function(feedId, itemIndex, feedItem) {
                            d3ComponentFactoryService.displayJSONStructure(
                                rootElement, feedItem, scopeApply(scope, scope.addFieldToTemplate));
                            scope.findFieldToAddToTemplateDialogShown = true;
                        },
                        function (status, message) {
                            logService.logDebug('noScaffoldFeedSuggestedPresentationEditionDialog: Fetching "' +
                                fetchParams.itemIndex + ' item from feed "' + fetchParams.feedId +
                                ' has failed: ' + message);
                        }
                    );
                };

                scope.addFieldToTemplate = function(fieldPath) {
                    scope.fieldPathToAddToTemplate = fieldPath;
                    scope.showPickFieldNameToAddToTemplateDialog();
                };

                scope.hideFindFieldToAddToTemplateDialog = function() {
                    scope.findFieldToAddToTemplateDialogShown = false;
                    scope.fieldPathToAddToTemplate = [];
                    scope.targetForFieldToAddToTemplate = '';
                    scope.caretPosition = null;
                };

                scope.showPickFieldNameToAddToTemplateDialog = function() {
                    scope.pickFieldNameToAddToTemplateDialogShown = true;
                };

                var stringInsert = function(string, startPosition, insert) {
                    return string.slice(0, startPosition) + insert + string.slice(startPosition);
                };

                scope.pickFieldNameToAddToTemplate = function() {
                    var fieldName = (scope.fieldNameToAddToTemplate || '').trim();
                    var target = scope.targetForFieldToAddToTemplate;
                    if (target != 'template' && target != 'cssStyle') {
                        return;
                    }

                    var feedDataSchema = JSON.parse(scope.feedSuggestedPresentation.dataSchema);
                    if (_.has(feedDataSchema, fieldName)) {
                        scope.showNameAlreadyTakenErrorMessage = true;
                        return;
                    }
                    feedDataSchema[scope.fieldNameToAddToTemplate] = scope.fieldPathToAddToTemplate;
                    scope.feedSuggestedPresentation.dataSchema = JSON.stringify(feedDataSchema, null, 2);

                    var currentValue = scope.feedSuggestedPresentation[target].trim();
                    var isDefaultValue = currentValue.length == 0
                        || currentValue == dataCfg.feedSuggestedPresentation.placeholderValues[target];
                    if (!isDefaultValue && _.isNumber(scope.caretPosition)) {
                        scope.feedSuggestedPresentation[target] = stringInsert(
                            scope.feedSuggestedPresentation[target], scope.caretPosition, '#{' + fieldName + '}');
                    } else {
                        var addedValue = (target == 'template' ?
                            'div #{' + fieldName + '}' : '\n.newClass {\n cssProperty: #{' + fieldName + '};\n}\n');
                        scope.feedSuggestedPresentation[target] =
                            (isDefaultValue ? '' : scope.feedSuggestedPresentation[target] + '\n') + addedValue;
                    }

                    scope.resetModalDialogs();
                };

                scope.hidePickFieldNameToAddToTemplateDialog = function() {
                    scope.pickFieldNameToAddToTemplateDialogShown = false;
                    scope.showNameAlreadyTakenErrorMessage = false;
                    scope.fieldNameToAddToTemplate = '';
                };

                scope.resetModalDialogs();
            }
        };
    })
    /* Directive: noScaffoldFeedAddDialog
     * Goal: Creates the noScaffold add feed dialog
     * Usage: <no-scaffold-feed-add-dialog add-callback="addFeed(feed)" display-dialog="showAddFeedDialog"></no-scaffold-feed-add-dialog>
     * Params:
     * 		- add-callback (required): the callback to call when the feed is to be added.
     * 		- display-dialog (required): the boolean flag to show/hide the dialog.
     * Description: Creates the noScaffold feed edition dialog
     */
    .directive('noScaffoldFeedAddDialog', function() {
        return {
            restrict: 'E',
            templateUrl: 'addFeedDialogTemplate',
            replace: true,
            scope: {
                'displayDialog': '=',
                'addCallback': '&'
            },
            link: function(scope) {
                scope.initFeed = function() {
                    scope.feed = {
                        feedId: '',
                        feedDetails: {
                            feedName: '',
                            templateUrl: '',
                            fetchParams: '{}'
                        }
                    };
                };
                scope.initFeed();

                scope.closeDialog = function() {
                    scope.initFeed();
                    scope.displayDialog = false;
                };

                scope.saveChanges = function() {
                    if (angular.isFunction(scope.addCallback)) {
                        scope.addCallback({feed: scope.feed});
                        scope.closeDialog();
                    }
                };
            }
        };
    })
    /* Directive: noScaffoldFeedEditDialog
     * Goal: Creates the noScaffold edit feed dialog
     * Usage: <no-scaffold-feed-edit-dialog selected-feed="selectedFeedForEdit" update-callback="updateFeedDetails(feedDetails)"></no-scaffold-feed-edit-dialog>
     * Params:
     * 		- selected-feed (required): the selectedFeed to update.
     * 		- update-callback (required): the callback to call when the selectedFeed is to be updated.
     * Description: Creates the noScaffold feed edition dialog
     */
    .directive('noScaffoldFeedEditDialog', function() {
        return {
            restrict: 'E',
            templateUrl: 'editFeedDialogTemplate',
            replace: true,
            scope: {
                'selectedFeed': '=',
                'updateCallback': '&'
            },
            link: function(scope) {
                scope.feedDetails = {};

                scope.$watch('selectedFeed', function(newValue, oldValue) {
                    if (angular.isObject(newValue) && newValue !== oldValue) {
                        _.assign(scope.feedDetails, _.pick(newValue, ['feedId']));
                        _.assignWith(scope.feedDetails,
                            _.pick(newValue.feedDetails, ['feedName', 'templateUrl', 'fetchParams']),
                            function(objValue, srcValue) {
                                return angular.isObject(srcValue) ?
                                    JSON.stringify(srcValue, null, 2) : srcValue; });
                    }
                });

                scope.closeDialog = function() {
                    scope.selectedFeed = undefined;
                };

                scope.saveChanges = function() {
                    if (angular.isFunction(scope.updateCallback)) {
                        scope.updateCallback({feedDetails: scope.feedDetails});
                        scope.closeDialog();
                    }
                };
            }
        };
    });

var scopeApply = function(scope, fn) {
    return function() {
        var args = arguments;
        scope.$apply(function() {
            fn.apply(this, args);
        });
    }
};
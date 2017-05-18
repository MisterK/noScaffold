'use strict';

/**** Data-related angular services ****/

angular.module('noScaffold.dataAngularServices', [])
    /* Return the data management configuration */
    .constant('dataCfg', {
        'feedItems': {
            'templateStringVarExtractionRegexp': '#\{([^\{\}]*)\}',
            'templateStringVarFallbackValue': ' '
        },
        'feedSuggestedPresentation': {
            'placeholderValues': {
                'template': 'div This is your feed\'s template. Modify it!',
                'cssStyle': '/* This is your feed\'s css style. Modify it! */',
                'dataSchema': '{}'
            }
        },
        'pageElements': {
            'defaultFill': 'black',
            'propertiesEnums': {
                'fill': ['black', 'red', 'blue', 'green'],
                'fontSize': ['12px', '14px', '18px', '24px'],
                'fontStyle': ['normal', 'italic', 'oblique'],
                'fontWeight': ['normal', 'bold', 'bolder', 'lighter'],
                'textDecoration': ['none', 'underline', 'overline', 'line-through', 'blink']
            },
            'propertiesDefaults': {
                'contents': 'Change me',
                'fontSize': '12px',
                'fontStyle': 'normal',
                'fontWeight': 'normal',
                'textDecoration': 'none',
                'radius': 20,
                'width': 40,
                'height': 20
            },
            sizeMultipliers: [0.5, 0.75, 1, 1.5, 2, 5]
        },
        pageElementTypes: ['svgText', 'svgCircle', 'svgRect']
    })
    .constant('doPageElementsIdsMatch', function (pageElementOrId1, pageElementOrId2) {
        var pageElementId1 = angular.isObject(pageElementOrId1) ? pageElementOrId1.pageElementId : pageElementOrId1;
        var pageElementId2 = angular.isObject(pageElementOrId2) ? pageElementOrId2.pageElementId : pageElementOrId2;
        return pageElementId1 === pageElementId2;
    })
    .constant('doFeedsIdsMatch', function(feedOrId1, feedOrId2) {
        var feedId1 = angular.isObject(feedOrId1) ? feedOrId1.feedId : feedOrId1;
        var feedId2 = angular.isObject(feedOrId2) ? feedOrId2.feedId : feedOrId2;
        return feedId1 === feedId2;
    })
    .service('feedSuggestedTemplateModifier', function(dataCfg, tagTreeBuilderFactory,
                                                       templateStringBuilder, tagTreeHandler) {
        this.feedItemTagRemoved = function(feed, tagPath) {
            if (angular.isObject(feed.tagTree)) {
                tagTreeHandler.removeNodeByPath(feed.tagTree, tagPath);
                feed.suggestedPresentation.template = templateStringBuilder.convertTagTreeToTemplateString(feed.tagTree);
            }
            return feed;
        };

        this.extrapolateTemplateStringVariables = function(dataSchema, templateString, dataItem) {
            return templateString.replace(new RegExp(dataCfg.feedItems.templateStringVarExtractionRegexp, 'g'),
                function(match, group) {
                    return _.get(dataItem,
                        dataSchema[group] || [],
                        dataCfg.feedItems.templateStringVarFallbackValue);
                });
        };

        var extractTagTreeFromTemplateString = function(templateString) {
            return _.reduce(
                    templateString.split(/\n/),
                    function(tagTreeBuilder, templateLine, templateLineIndex) {
                        return tagTreeBuilder.handleNewTemplateLine(templateLine, templateLineIndex);
                    },
                    tagTreeBuilderFactory.createTagTreeBuilder())
                .build();
        };

        this.initFeedWithTemplate = function(feed) {
            if (angular.isString(feed.suggestedPresentation.template) && !angular.isObject(feed.tagTree)) {
                feed.tagTree = extractTagTreeFromTemplateString(feed.suggestedPresentation.template);
            }
            if (!angular.isObject(feed.originalSuggestedPresentation)) {
                feed.originalSuggestedPresentation = {};
            }
            if (!angular.isString(feed.originalSuggestedPresentation.template)) {
                feed.originalSuggestedPresentation.template = feed.suggestedPresentation.template;
            }
            if (!angular.isString(feed.originalSuggestedPresentation.cssStyle)) {
                feed.originalSuggestedPresentation.cssStyle = feed.suggestedPresentation.cssStyle;
            }
            if (!angular.isObject(feed.originalSuggestedPresentation.dataSchema)) {
                feed.originalSuggestedPresentation.dataSchema = feed.suggestedPresentation.dataSchema;
            }
        };

        this.resetFeedSuggestedPresentation = function(feed) {
            feed.suggestedPresentation.template = feed.originalSuggestedPresentation.template;
            feed.tagTree = extractTagTreeFromTemplateString(feed.suggestedPresentation.template);
            feed.suggestedPresentation.cssStyle = feed.originalSuggestedPresentation.cssStyle;
            feed.suggestedPresentation.dataSchema = feed.originalSuggestedPresentation.dataSchema;
            return feed;
        };

        this.updateFeedSuggestedPresentation = function(feed, feedSuggestedPresentation) {
            feed.suggestedPresentation.template = feedSuggestedPresentation.template;
            feed.tagTree = extractTagTreeFromTemplateString(feed.suggestedPresentation.template);
            feed.suggestedPresentation.cssStyle = feedSuggestedPresentation.cssStyle;
            feed.suggestedPresentation.dataSchema = JSON.parse(feedSuggestedPresentation.dataSchema || '{}'); //TODO Later: validate
            return feed;
        };

        var s4 = function () {
            return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        };
        this.getNewUUID = function () {
            return (s4()+s4()+"-"+s4()+"-"+s4()+"-"+s4()+"-"+s4()+s4()+s4());
        };
    })
    .service('pageElementsFactory', function(dataCfg) {
        this.createPageElement = function(pageElementType, coordinates, params) {
            switch (pageElementType) {
                case 'svgText':
                    return new TextPageElement(coordinates, params);
                case 'svgCircle':
                    return new CirclePageElement(coordinates, params);
                case 'svgRect':
                    return new RectanglePageElement(coordinates, params);
            }
        };

        this.augmentPageElement = function(pageElement) {
            switch (pageElement.pageElementType) {
                case 'svgText':
                    _.mixin(pageElement, new TextPageElement);
                    break;
                case 'svgCircle':
                    _.mixin(pageElement, new CirclePageElement);
                    break;
                case 'svgRect':
                    _.mixin(pageElement, new RectanglePageElement);
                    break;

            }
        };

        var shiftInArray = function(array, currentValue) {
            var currentIndex = (_.findIndex(array, function(v) {return v == currentValue; }) || 0);
            return array[currentIndex < array.length -1 ? currentIndex + 1 : 0];
        };

        var uuid = function () {
            var s4 = function () {
                return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
            };
            return (s4()+s4()+"-"+s4()+"-"+s4()+"-"+s4()+"-"+s4()+s4()+s4());
        };

        var compose = function() { //Thanks to http://javascript.boxsheep.com/how-to-javascript/How-to-write-a-compose-function/
            var fn = arguments, origLength = fn.length;
            return function() {
                var thisObject = this, length = origLength;
                return (function recursion(arg) {
                    var newArgs = (arguments.length == 1 && angular.isArray(arguments[0]) ? arguments[0] : arguments);
                    return length ? recursion(fn[--length].apply(thisObject, newArgs)) : arg;
                }).apply(thisObject, arguments);
            };
        };

        var oooInherit = function(parentConstructorFn, preParentConstructionFn, postParentConstructionFn) {
            var childConstructorFn = compose(postParentConstructionFn, parentConstructorFn, preParentConstructionFn);
            childConstructorFn.prototype = _.create(parentConstructorFn.prototype, {'constructor': childConstructorFn});
            return childConstructorFn;
        };

        var PageElement = function(coordinates, params) {
            if (!angular.isDefined(coordinates) || !angular.isDefined(params)) {
                return this;
            }

            this.pageElementId = uuid();
            this.key = this.pageElementId;
            this.version = 0;
            this.x = coordinates[0];
            this.y = coordinates[1];
            this.fill = dataCfg.pageElements.defaultFill;
            this.togglableProperties = ['fill'];
            if (angular.isArray(params.togglableProperties)) {
                this.togglableProperties.push.apply(this.togglableProperties, params.togglableProperties);
            }
            this.isTextual = angular.isDefined(params.isTextual) ? params.isTextual : false;

            return this;
        };

        PageElement.prototype.toggleProperty = function(propertyName) {
            if (this.togglableProperties.indexOf(propertyName) < 0) {
                return;
            }
            if (angular.isArray(dataCfg.pageElements.propertiesEnums[propertyName])) {
                this[propertyName] = shiftInArray(dataCfg.pageElements.propertiesEnums[propertyName], this[propertyName]);
            } else {
                var defaultValue = dataCfg.pageElements.propertiesDefaults[propertyName];
                if (angular.isDefined(defaultValue)) {
                        this[propertyName] = shiftInArray(dataCfg.pageElements.sizeMultipliers,
                            Math.round(this[propertyName] / defaultValue)) * defaultValue;
                }
            }
        };

        var TextPageElement = oooInherit(PageElement,
            function(coordinates, params) {
                this.pageElementType = 'svgText';

                var newParams = _.extend({
                    togglableProperties: ['fontSize', 'fontWeight', 'fontStyle', 'textDecoration'],
                    isTextual: true
                }, params);

                return [coordinates, newParams];
            },
            function() {
                _.forEach(['contents', 'fontSize', 'fontStyle', 'fontWeight', 'textDecoration'],
                    function(propertyName) {
                        this[propertyName] = dataCfg.pageElements.propertiesDefaults[propertyName];
                    }, this);

                this.centerX = this.x;
                this.centerY = this.y;

                return this;
            }
        );

        TextPageElement.prototype.toggleSize = function() {
            this.toggleProperty('fontSize');
        };

        TextPageElement.prototype.changeTextContents = function(newContents) {
            this.contents = newContents;
        };

        var CirclePageElement = oooInherit(PageElement,
            function(coordinates, params) {
                this.pageElementType = 'svgCircle';

                var newParams =_.extend({
                    togglableProperties: ['radius']
                }, params);

                return [coordinates, newParams];
            },
            function() {
                this.radius = dataCfg.pageElements.propertiesDefaults['radius'];
                this.centerX = this.x;
                this.centerY = this.y;

                return this;
            }
        );

        CirclePageElement.prototype.toggleSize = function() {
            this.toggleProperty('radius');
        };

        var RectanglePageElement = oooInherit(PageElement,
            function(coordinates, params) {
                this.pageElementType = 'svgRect';

                this.width = dataCfg.pageElements.propertiesDefaults['width'];
                this.height = dataCfg.pageElements.propertiesDefaults['height'];

                if (angular.isArray(coordinates) && coordinates.length >= 2) {
                    this.centerX = coordinates[0];
                    this.centerY = coordinates[1];
                    coordinates[0] = coordinates[0] - (this.width / 2);
                    coordinates[1] = coordinates[1] - (this.height / 2);
                }

                var newParams = _.extend({
                    togglableProperties: ['width', 'height']
                }, params);

                return [coordinates, newParams];
            },
            function() {
                return this;
            }
        );

        RectanglePageElement.prototype.toggleSize = function() {
            this.toggleProperty('width');
            this.toggleProperty('height');
        };
    });
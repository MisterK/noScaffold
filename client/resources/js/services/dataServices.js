'use strict';

/**** Data-related angular services ****/

angular.module('noScaffold.dataAngularServices', [])
    /* Return the data management configuration */
    .constant('dataCfg', {
        'feedItems': {
            'templateStringTagExtractionRegexp': '^\s*([a-z]+)?(#[a-zA-Z0-9]+)?(\\.[a-zA-Z0-9]+)?(\\([^\)]*\\))?\s?(.*)$',
            'templateStringVarExtractionRegexp': '#\{([^\{\}]*)\}',
            'templateStringVarSeparator': '|||',
            'templateStringVarElseValue': ' '
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
    .service('feedSuggestedTemplateModifier', function(dataCfg) {
        this.feedItemLineRemoved = function(feed, lineIndex) {
            if (angular.isArray(feed.tagArray)) {
                feed.tagArray.splice(lineIndex, 1);
                feed.suggestedTemplate = this.convertTagArrayToTemplateString(feed.tagArray);
            }
            return feed;
        };

        this.convertTagArrayToTemplateString = function(tagArray) {
            return _.map(tagArray, function(tag) {
                var tagTemplateString = tag.tagName +
                    (tag.tagAttributes['id'] ? '#' + tag.tagAttributes['id'] : '') +
                    (tag.tagAttributes['class'] ? '.' + tag.tagAttributes['class'] : '');
                var attributesString =_(tag.tagAttributes).map(function(value, key) {
                    if (['id', 'class'].indexOf(key) < 0) {
                        return key + '=' + '\'' + value + '\'';
                    }
                }).filter(angular.isString).value().join(', ');
                if (attributesString.length > 0) {
                    tagTemplateString += '(' + attributesString + ')';
                }
                if (tag.tagContents.length > 0) {
                    tagTemplateString += ' ' + tag.tagContents;
                }
                return tagTemplateString;
            }).join('\n');
        };

        this.extrapolateTemplateStringVariables = function(templateString, dataItem) {
            return templateString.replace(new RegExp(dataCfg.feedItems.templateStringVarExtractionRegexp, 'g'),
                function(match, group) {
                    return _.get(dataItem,
                        group.split(dataCfg.feedItems.templateStringVarSeparator),
                        dataCfg.feedItems.templateStringVarElseValue);
                });
        };

        this.extractTagsFromTemplateString = function(templateString) {
            return _.map(templateString.split(/\n/), extractTagFromTemplateStringLine);
        };

        var extractTagFromTemplateStringLine = function(templateStringLine) {
            var groups = new RegExp(dataCfg.feedItems.templateStringTagExtractionRegexp, 'g').exec(templateStringLine);
            var tagAttributes = {
                'class': ''
            };
            if (!angular.isArray(groups) || groups.length < 6) {
                console.error('Groups pb for templateStringLine |' + templateStringLine + '|');
                return {
                    tagName: 'div',
                    tagAttributes: tagAttributes,
                    tagContents: templateStringLine
                };
            }
            if (angular.isString(groups[2])) {
                tagAttributes['id'] = groups[2].substring(1, groups[2].length);
            }
            if (angular.isString(groups[3])) {
                tagAttributes['class'] = groups[3].substring(1, groups[3].length);
            }
            if (angular.isString(groups[4])) {
                var attrGroups = new RegExp('([a-z-]+)\s*=\s*\'([^\']+)+\'').exec(groups[4]);
                if (angular.isArray(attrGroups) && attrGroups.length == 3
                    && angular.isString(attrGroups[1]) && angular.isString(attrGroups[2])) {
                    tagAttributes[attrGroups[1]] = attrGroups[2];
                }
            }
            var tagContents = '';
            if (angular.isString(groups[5])) {
                tagContents = groups[5].substring(1, groups[5].length);
            }
            return {
                tagName: groups[1] || 'div',
                tagAttributes: tagAttributes,
                tagContents: tagContents
            }
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
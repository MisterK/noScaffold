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
        }
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

        var stringInsert = function(string, startPosition, insert) {
            return string.slice(0, startPosition) + insert + string.slice(startPosition);
        };

        var convertArrayTagPathToStringRepresentation = function(tagPath) {
            if (_.find(tagPath, function(tagPathItem) { return !/^[a-zA-Z0-9_-]*$/.test(tagPathItem); })) {
                //If any tagPath has some special characters, fall back to array representation
                return tagPath;
            }
            return _.reduce(tagPath, function(result, tagPathItem) {
                if (_.isNaN(parseInt(tagPathItem))) {
                    result += (result.length > 0 ? '.' : '') + tagPathItem;
                } else {
                    result += '[' + tagPathItem + ']';
                }
                return result;
            }, '');
        };

        var TARGET_TEMPLATE = 'template';
        var TARGET_CSS_STYLE = 'cssStyle';

        this.addFieldToDataSchema = function(dataSchema, fieldName, fieldPath) {
            var feedDataSchema = JSON.parse(dataSchema);
            if (_.has(feedDataSchema, fieldName)) {
                throw 'showNameAlreadyTakenErrorMessage';
            }
            feedDataSchema[fieldName] = convertArrayTagPathToStringRepresentation(fieldPath);
            return JSON.stringify(feedDataSchema, null, 2);
        };

        this.addFieldReferenceToTargetField = function(targetField, target, caretPosition, fieldName) {
            var currentValue = targetField.trim();
            var isDefaultValue = currentValue.length == 0
                || currentValue == dataCfg.feedSuggestedPresentation.placeholderValues[target];
            if (!isDefaultValue && _.isNumber(caretPosition)) {
                var appendix =
                    (targetField.charAt(caretPosition - 1) != ' ' ? ' ' : '') +
                    '#{' + fieldName + '}';
                return {
                    newValue: stringInsert(targetField, caretPosition, appendix),
                    caretPosition: caretPosition + appendix.length
                };
            } else {
                var addedValue = (!isDefaultValue ? '\n' : '') +
                    (target == TARGET_TEMPLATE ?
                    'div #{' + fieldName + '}' :
                    '.#newClass# {\n #cssProperty#: #{' + fieldName + '};\n}\n');
                var replacementValue = (isDefaultValue ? '' : targetField + '\n');
                return {
                    newValue: replacementValue + addedValue,
                    caretPosition: replacementValue.length + (target == TARGET_TEMPLATE ? addedValue.length : 1)
                };
            }
        };

        this.addCSSClassToStyle = function(cssStyle, cssClassNameToAdd) {
            if (cssStyle.indexOf('.' + cssClassNameToAdd + ' ') >= 0) {
                throw 'showCSSClassNameAlreadyTakenErrorMessage';
            }
            var currentCSSStyleValue = cssStyle.trim();
            var cssStyleIsDefaultValue = currentCSSStyleValue.length == 0
                || currentCSSStyleValue == dataCfg.feedSuggestedPresentation.placeholderValues.cssStyle;
            return (cssStyleIsDefaultValue ? '' : currentCSSStyleValue + '\n\n') +
                '.' + cssClassNameToAdd + ' {\n    \n}';
        };

        this.addCSSClassReferenceToTemplate = function(template, caretPosition, cssClassNameToAdd) {
            var currentTemplateValue = template.trim();
            var templateIsDefaultValue = currentTemplateValue.length == 0
                || currentTemplateValue == dataCfg.feedSuggestedPresentation.placeholderValues.template;
            var resultingTemplate;
            if (!templateIsDefaultValue && _.isNumber(caretPosition)) {
                return stringInsert(template, caretPosition,
                    (template.charAt(caretPosition - 1) != '.' ? '.' : '') + cssClassNameToAdd);
            } else {
                return (templateIsDefaultValue ? '' : template + '\n') + 'div.' + cssClassNameToAdd;
            }
        };
    });
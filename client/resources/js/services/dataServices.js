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
    });
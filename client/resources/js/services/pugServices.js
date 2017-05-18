'use strict';

/**** Pug-related angular services ****/

angular.module('noScaffold.pugAngularServices', [])
    /* Return the data management configuration */
    .constant('pugCfg', {
        'feedItems': {
            'templateStringTagExtractionRegexp': '^(\\s*)?([a-z]+)?(#[a-zA-Z0-9]+)?(\\.[a-zA-Z0-9]+)?(\\([^\\)]*\\))?\\s?(.*)$'
        }
    })
    .service('tagTreeBuilderFactory', function(pugCfg) {
        var extractTagFromTemplateStringLine = function(templateStringLine) {
            var groups = new RegExp(pugCfg.feedItems.templateStringTagExtractionRegexp, 'g').exec(templateStringLine);
            var tagAttributes = {
                'class': ''
            };
            if (!angular.isArray(groups) || groups.length < 7) {
                console.error('Groups pb for templateStringLine |' + templateStringLine + '|');
                return {
                    tagName: 'div',
                    tagAttributes: tagAttributes,
                    tagContents: templateStringLine
                };
            }

            var idValue = groups[3];
            if (angular.isString(idValue)) {
                tagAttributes['id'] = idValue.substring(1, idValue.length);
            }
            var classValue = groups[4];
            if (angular.isString(classValue)) {
                tagAttributes['class'] = classValue.substring(1, classValue.length);
            }
            var attributesValue = groups[5];
            if (angular.isString(attributesValue)) {
                var attrGroups = new RegExp('([a-z-]+)\s*=\s*\'([^\']+)+\'').exec(attributesValue);
                if (angular.isArray(attrGroups) && attrGroups.length == 3
                    && angular.isString(attrGroups[1]) && angular.isString(attrGroups[2])) {
                    tagAttributes[attrGroups[1]] = attrGroups[2];
                }
            }
            return {
                tagIndentationLevel: Math.ceil((groups[1] || '').length / 2),
                tagName: groups[2] || 'div',
                tagAttributes: tagAttributes,
                tagContents: groups[6] || ''
            }
        };

        function TagTreeBuilder() {
            this.rootNode = {
                tagPath: [],
                tagIndentationLevel: -1,
                isRootNode: true
            };
            this.currentNode = this.rootNode;
        }

        TagTreeBuilder.prototype.findAncestorNodeOfSameIndentationLevel = function(currentNode, targetIndentationLevel) {
            if (!currentNode) {
                return this.rootNode;
            } else if ((currentNode.tagPath.length - 1) == targetIndentationLevel) {
                return currentNode;
            } else {
                return this.findAncestorNodeOfSameIndentationLevel(currentNode.parentNode, targetIndentationLevel);
            }
        };

        TagTreeBuilder.prototype.handleNewTemplateLine = function(templateLine) {
            var tag = extractTagFromTemplateStringLine(templateLine);
            var indexOfTagInChildrenNodes;
            if (this.currentNode.isRootNode || tag.tagIndentationLevel > (this.currentNode.tagPath.length - 1)) {
                //Adding a new children node
                this.currentNode.childrenNodes = _.concat(this.currentNode.childrenNodes || [], tag);
                tag.parentNode = this.currentNode;
                indexOfTagInChildrenNodes = 0;
            } else {
                var parentNode = this.findAncestorNodeOfSameIndentationLevel(
                    this.currentNode, tag.tagIndentationLevel - 1);
                var childrenNodes = parentNode.childrenNodes || [];
                indexOfTagInChildrenNodes = childrenNodes.length;
                parentNode.childrenNodes = _.concat(childrenNodes, tag);
                tag.parentNode = parentNode;
            }
            tag.tagPath = _.concat(tag.parentNode.tagPath, indexOfTagInChildrenNodes);
            this.currentNode = tag;
            return this;
        };

        TagTreeBuilder.prototype.build = function() {
            this.currentNode = this.rootNode;
            return this.rootNode;
        };

        this.createTagTreeBuilder = function() {
            return new TagTreeBuilder();
        };
    })
    .service('templateStringBuilder', function() {
        var convertTagChildren = function(childrenNodes) {
            return _.map(childrenNodes, convertTag).join('\n');
        };

        var convertTag = function(tag) {
            var tagIndentation = _.repeat(' ', (tag.tagPath.length - 1) * 2);
            var tagTemplateString = tagIndentation +
                tag.tagName +
                (tag.tagAttributes['id'] ? '#' + tag.tagAttributes['id'] : '') +
                (tag.tagAttributes['class'] ? '.' + tag.tagAttributes['class'] : '');
            var attributesString = _(tag.tagAttributes)
                .map(function(value, key) {
                    if (['id', 'class'].indexOf(key) < 0) {
                        return key + '=' + '\'' + value + '\'';
                    }
                })
                .filter(angular.isString)
                .value()
                .join(', ');
            if (attributesString.length > 0) {
                tagTemplateString += '(' + attributesString + ')';
            }
            if (tag.tagContents.length > 0) {
                tagTemplateString += ' ' + tag.tagContents;
            }
            if ((tag.childrenNodes || []).length > 0) { //TODO Question: render children nodes before or after tagContents?
                tagTemplateString += '\n' + convertTagChildren(tag.childrenNodes);
            }
            return tagTemplateString;
        };

        this.convertTagTreeToTemplateString = function(tagTree) {
            return convertTagChildren(tagTree.childrenNodes);
        };
    })
    .service('tagTreeHandler', function() {
        var findNodeByPath = function(currentNode, searchedPath) {
            var directChildNode = currentNode.childrenNodes[searchedPath[0]];
            if (searchedPath.length == 1 || !directChildNode) {
                return directChildNode;
            } else {
                return findNodeByPath(directChildNode, _.drop(searchedPath));
            }
        };

        this.findNodeByPath = function(tagTree, searchedPath) {
            if ((searchedPath || []).length == 0) {
                return;
            }
            return findNodeByPath(tagTree, searchedPath);
        };

        var updateNodeAndItsChildrenPaths = function(pathPrefix, node) {
            node.tagPath = _.concat(pathPrefix, _.takeRight(node.tagPath));
            _.forEach(node.childrenNodes, _.curry(updateNodeAndItsChildrenPaths)(node.tagPath));
        };

        this.removeNodeByPath = function(tagTree, tagPath) {
            if ((tagPath || []).length == 0) {
                return; //Can't remove the root node
            }
            var node = this.findNodeByPath(tagTree, tagPath);
            if (angular.isObject(node)) {
                var searchedNodeIndex = _.takeRight(tagPath);
                node.parentNode.childrenNodes = _.filter(node.parentNode.childrenNodes, function(node, index) {
                    if (index > searchedNodeIndex) {
                        node.tagPath.splice(node.tagPath.length - 1, 1, index - 1);
                        _.forEach(node.childrenNodes, _.curry(updateNodeAndItsChildrenPaths)(node.tagPath));
                    }
                    return index != searchedNodeIndex;
                });
                return node;
            }
        };
    });
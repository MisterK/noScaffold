'use strict';

/**** Common angular services ****/

angular.module('noScaffold.ioAngularServices', [])
    .service('serverCommunicationService', function($window, directQueryService, logService) {
        this.getServerConnection = function() {
            return new ServerConnection();
        };

        function ServerConnection() {
            if (!(this instanceof ServerConnection)) return new ServerConnection();

            var socket = undefined;
            var thisConnection = this;
            this.isConnected = false;

            this.connectToServerEventsWithListeners = function(registerEventHandlerDescriptors,
                                                                internalEventHandlerDescriptors) {
                if (!angular.isDefined($window.io)) {
                    return this;
                }
                socket = $window.io.connect('', {
                    'force new connection': true,
                    'connect timeout': 5000,
                    query: undefined
                });
                _.forEach(registerEventHandlerDescriptors, function(eventHandlerFunction, eventType) {
                    socket.on(eventType, function(serverResponse) {
                        eventHandlerFunction(serverResponse);
                    });
                });
                var triggerConnectedToServerCallback = function() {
                    if (angular.isFunction(internalEventHandlerDescriptors['connectedToServer'])) {
                        internalEventHandlerDescriptors['connectedToServer']();
                    }
                };
                socket.on('connect', function() {
                    logService.log('Connected to server');
                    thisConnection.isConnected = true;
                    triggerConnectedToServerCallback();
                });
                socket.on('connect_error', function(error) {
                    logService.logError('Could not connect to server "' + error + '", will retry soon');
                    thisConnection.isConnected = false;
                });
                socket.on('connect_timeout', function(timeout) {
                    logService.logError('Connection to server timed out after ' + timeout + ', will retry soon');
                    thisConnection.isConnected = false;
                });
                socket.on('reconnect', function(attempt) {
                    logService.log('Re-connected to server after ' + attempt + ' attempts');
                    thisConnection.isConnected = true;
                    triggerConnectedToServerCallback();
                });
                socket.on('reconnect_failed', function() {
                    logService.logError('Could not re-connect to server, will retry soon');
                    thisConnection.isConnected = false;
                });
                socket.on('disconnect', function (reason) {
                  logService.logError('Disconnect from server "' + reason + '"');
                  thisConnection.isConnected = false;
                });
                socket.on('error', function (error) {
                  logService.logError('Error from server "' + error + '"');
                });

                return this;
            };

            var emitEvent = function(eventType, data, callback) {
                if (angular.isDefined(data)) {
                    socket.emit(eventType, data, callback);
                } else {
                    socket.emit(eventType, callback);
                }
            };

            this.discoverFeeds = function(exclusionList, successCallback, errorCallback) {
                emitEvent('discoverFeeds', exclusionList, function(response) {
                    if (response.status == 200) {
                        (successCallback || _.noop)(response.feeds);
                    } else {
                        (errorCallback || _.noop)(response.status, response.message);
                    }
                });
            };

            this.fetchFeedItem = function(feed, fetchParams, successCallback, errorCallback) {
                if (thisConnection.isConnected) {
                    emitEvent('fetchFeedItem', fetchParams, function(response) {
                        if (response.status == 200) {
                            (successCallback || _.noop)(response.feedId, response.itemIndex, response.feedItem);
                        } else {
                            (errorCallback || _.noop)(response.status, response.message);
                        }
                    });
                } else {
                    directQueryService.queryJsonApi(feed, fetchParams, successCallback, errorCallback);
                }
            };

            this.savePageElement = function(pageElement, successCallback, errorCallback) {
                emitEvent('savePageElement', pageElement, function(response) {
                    if (response.status == 200) {
                        (successCallback || _.noop)();
                    } else {
                        (errorCallback || _.noop)(response.status, response.message);
                    }
                });
            };
        }
    })
    .service('directQueryService', function($http, logService) {
        this.queryJsonApi = function(feed, fetchParams, successCallback, errorCallback) {
            if (!angular.isObject(feed)) {
                logService.logError('Feed is mandatory');
                return;
            }
            var url = _.reduce(_.keys(fetchParams), function(url, fetchParamKey) {
                return url.replace('#' + fetchParamKey + '#', fetchParams[fetchParamKey]);
            }, feed.templateUrl);
            if (/#[a-zA-Z]+#/.test(url)) {
                return errorCallback(400,
                    'Some fetch params are missing: [' + getMatches(url, /(#[a-zA-Z]+#)/g).join(', ') + ']');
            }
            var req = {
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'application/json'
                }
            };
            return $http(req).then(function(response) {
                (successCallback || _.noop)(fetchParams.feedId, fetchParams.itemIndex, response.data);
            }, function(response) {
                (errorCallback || _.noop)(response.status, response.statusText + '-' + response.data);
            });
        };
    });

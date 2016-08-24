'use strict';

/**** Log-related angular services ****/

angular.module('noScaffold.logServices', [])
    /* Return the localStorage configuration */
    .constant('logLevels', ['DEBUG', 'INFO', 'ERROR'])
    .constant('logLevel', 'DEBUG')
    .service('logService', function(logLevels, logLevel) {
        var currentLogLevelIndex = _.indexOf(logLevels, logLevel);

        var isLogEnabled = function(level) {
            return _.indexOf(logLevels, level) >= currentLogLevelIndex;
        };

        this.logError = function(message) {
            if (isLogEnabled('ERROR')) {
                console.error(new Date().toLocaleTimeString() + ' - ' + message);
            }
        };

        this.log = function(message) {
            if (isLogEnabled('INFO')) {
                console.log(new Date().toLocaleTimeString() + ' - ' + message);
            }
        };

        this.logDebug = function(message) {
            if (isLogEnabled('DEBUG')) {
                console.debug(new Date().toLocaleTimeString() + ' - ' + message);
            }
        };
    });


'use strict';

/* App level Angular module
 * Requires: persistenceServices.js, dataServices.js, ioServices.js, logServices.js, directives.js, controllers.js
 */
angular.module('noScaffold', ['noScaffold.persistenceServices',
                                'noScaffold.dataAngularServices',
                                'noScaffold.ioAngularServices',
                                'noScaffold.d3AngularServices',
                                'noScaffold.logServices',
                                'noScaffold.directives',
                                'noScaffold.controllers']);
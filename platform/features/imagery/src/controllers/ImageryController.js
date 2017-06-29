/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2017, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

/**
 * This bundle implements views of image telemetry.
 * @namespace platform/features/imagery
 */
define(
    ['moment'],
    function (moment) {

        /**
         * Controller for the "Imagery" view of a domain object which
         * provides image telemetry.
         * @constructor
         * @memberof platform/features/imagery
         */
        function ImageryController($scope, openmct) {
            this.$scope = $scope;
            this.openmct = openmct;
            this.date = "";
            this.time = "";
            this.zone = "";
            this.imageUrl = "";
            this.lastBound = undefined;
            // Temporary workaround for multiple bounds events,
            // keeps track of most recent change to bounds to prevent multiple
            // querries per individual bounds change

            this.$scope.imageHistory = [];
            this.$scope.filters = {
                brightness: 100,
                contrast: 100
            };

            this.subscribe = this.subscribe.bind(this);
            this.stopListening = this.stopListening.bind(this);
            this.updateValues = this.updateValues.bind(this);
            this.onBoundsChange = this.onBoundsChange.bind(this);

            // Subscribe to telemetry when a domain object becomes available
            this.subscribe(this.$scope.domainObject);

            // Unsubscribe when the plot is destroyed
            this.$scope.$on("$destroy", this.stopListening);
            this.openmct.time.on('bounds', this.onBoundsChange);
        }

        ImageryController.prototype.subscribe = function (domainObject) {
            this.date = "";
            this.imageUrl = "";
            this.openmct.objects.get(domainObject.getId())
                .then(function (object) {
                    this.domainObject = object;
                    var metadata = this.openmct
                        .telemetry
                        .getMetadata(this.domainObject);
                    var timeKey = this.openmct.time.timeSystem().key;
                    this.timeFormat = this.openmct
                        .telemetry
                        .getValueFormatter(metadata.value(timeKey));
                    this.imageFormat = this.openmct
                        .telemetry
                        .getValueFormatter(metadata.valuesForHints(['image'])[0]);
                    this.unsubscribe = this.openmct.telemetry
                        .subscribe(this.domainObject, this.updateValues);
                    this.requestHistory(this.openmct.time.bounds())
                        .then(function (result) {
                            this.requestLad();
                        }.bind(this));
                }.bind(this));
        };

        ImageryController.prototype.requestHistory = function (bounds) {
            this.openmct.telemetry
                .request(this.domainObject, bounds)
                .then(function (values) {
                    this.$scope.imageHistory = [];
                    values.forEach(function (datum) {
                        this.updateValues(datum);
                    }.bind(this));
                }.bind(this));
            return Promise.resolve();
            // Is this an inappropriate use of a Promise because it doesn't return
            // any relevant data? Implemented this so I could wait until historical
            // querry resolves before requesting LAD but curious if there's a cleaner
            // solution
        };

        ImageryController.prototype.requestLad = function () {
            this.openmct.telemetry
                .request(this.domainObject, {
                    strategy: 'latest',
                    size: 1
                })
                .then(function (values) {
                    this.updateValues(values[0]);
                }.bind(this));
        };

        ImageryController.prototype.stopListening = function () {
            if (this.unsubscribe) {
                this.unsubscribe();
                delete this.unsubscribe;
            }
            this.openmct.time.off('bounds', this.onBoundsChange);
        };

        ImageryController.prototype.onBoundsChange = function (newBounds, tick) {
            // Only request new historical data if bound change was
            // not automatic (i.e. !tick)
            // Checks to make sure only one querry is made per bound change

            if (!tick && !this.equalBounds(this.lastBound, newBounds)) {
                this.lastBound = newBounds;
                this.requestHistory(newBounds)
                    .then(function () {
                        this.requestLad();
                    }.bind(this));
            }
        };

        // Given two bound objects, returns true if they describe the same time
        // period
        ImageryController.prototype.equalBounds = function (oldBound, newBound) {
            if (!oldBound || !newBound || oldBound.start !== newBound.start ||
                oldBound.end !== newBound.end) {
                return false;
            }
            return true;
        };

        // Update displayable values to reflect latest image telemetry
        ImageryController.prototype.updateValues = function (datum) {
            if (this.isPaused) {
                this.nextDatum = datum;
                return;
            }

            datum.displayableDate =
                this.timeFormat.format(datum).split(' ')[0];
            datum.displayableTime =
                this.timeFormat.format(datum).split(' ')[1];
            if (!this.$scope.imageHistory.length ||
                this.$scope.imageHistory.slice(-1)[0].utc !== datum.utc) {
                this.$scope.imageHistory.push(datum);
            }
            // THIS NEEDS TO BE TESTED (ensures that on bound change /
            // view change the most resent datum is not added twice)
            // could prove unecessary but with current LAD implementation
            // fixes doubling issue

            this.time = this.timeFormat.format(datum);
            this.imageUrl = this.imageFormat.format(datum);
        };

        /**
         * Get the time portion (hours, minutes, seconds) of the
         * timestamp associated with the incoming image telemetry.
         * @returns {string} the time
         */
        ImageryController.prototype.getTime = function () {
            return this.time;
        };

        /**
         * Get the URL of the image telemetry to display.
         * @returns {string} URL for telemetry image
         */
        ImageryController.prototype.getImageUrl = function () {
            return this.imageUrl;
        };

        /**
         * Getter-setter for paused state of the view (true means
         * paused, false means not.)
         * @param {boolean} [state] the state to set
         * @returns {boolean} the current state
         */
        ImageryController.prototype.paused = function (state) {
            if (arguments.length > 0 && state !== this.isPaused) {
                this.isPaused = state;
                if (this.nextDatum) {
                    this.updateValues(this.nextDatum);
                    delete this.nextDatum;
                }
            }
            return this.isPaused;
        };

        return ImageryController;
    }
);

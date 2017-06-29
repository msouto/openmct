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

define([

], function(

) {
    function ImageryPlugin() {

        var IMAGE_SAMPLES = [
                "example/imagery/img/1.jpg",
                "example/imagery/img/2.jpg",
                "example/imagery/img/3.jpg",
                "example/imagery/img/4.jpg",
                "example/imagery/img/5.jpg",
                "example/imagery/img/6.jpg",
                "example/imagery/img/7.jpg",
                "example/imagery/img/8.jpg",
                "example/imagery/img/9.jpg"
        ];

        function pointForTimestamp(timestamp) {
            return {
                utc: Math.floor(timestamp / 5000) * 5000,
                url: IMAGE_SAMPLES[Math.floor(timestamp / 5000) % IMAGE_SAMPLES.length]
            };
        }

        var realtimeProvider = {
            supportsSubscribe: function (domainObject) {
                return domainObject.type === 'example.imagery';
            },
            subscribe: function (domainObject, callback) {
                var interval = setInterval(function () {
                    callback(pointForTimestamp(Date.now()));
                }, 5000);

                return function (interval) {
                    clearInterval(interval);
                };
            }
        };

        var historicalProvider = {
            supportsRequest: function (domainObject, options) {
                return domainObject.type === 'example.imagery'
                    && options.strategy !== 'latest';
            },
            request: function (domainObject, options) {
                var start = options.start;
                var end = options.end;
                var data = [];
                while (start < end) {
                    data.push(pointForTimestamp(start));
                    start += 5000;
                }
                return Promise.resolve(data);
            }
        };

        var ladProvider = {
            supportsRequest: function (domainObject, options) {
                return domainObject.type === 'example.imagery' &&
                    options.strategy === 'latest';
            },
            request: function (domainObject, options) {
                return Promise.resolve([pointForTimestamp(Date.now())]);
            }
        };


        return function install(openmct) {
            openmct.types.addType('example.imagery', {
                key: 'example.imagery',
                name: 'Example Imagery',
                cssClass: 'icon-image',
                description: 'For development use. Creates example imagery ' +
                    'data that mimics a live imagery stream.',
                creatable: true,
                initialize: function (object) {
                    object.telemetry = {
                        values: [
                            {
                                name: 'Time',
                                key: 'utc',
                                format: 'utc',
                                hints: {
                                    domain: 1
                                }
                            },
                            {
                                name: 'Image',
                                key: 'url',
                                format: 'image',
                                hints: {
                                    image: 1
                                }
                            }
                        ]
                    }
                }
            });

            openmct.telemetry.addProvider(realtimeProvider);
            openmct.telemetry.addProvider(historicalProvider);
            openmct.telemetry.addProvider(ladProvider);
        };
    }

    return ImageryPlugin;
});

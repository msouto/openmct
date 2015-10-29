/*****************************************************************************
 * Open MCT Web, Copyright (c) 2014-2015, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT Web is licensed under the Apache License, Version 2.0 (the
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
 * Open MCT Web includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

/*global define */

define(
    ["../../../commonUI/browse/lib/uuid"],
    function (uuid) {
        "use strict";

        /**
         * CopyService provides an interface for deep copying objects from one
         * location to another.  It also provides a method for determining if
         * an object can be copied to a specific location.
         * @constructor
         * @memberof platform/entanglement
         * @implements {platform/entanglement.AbstractComposeService}
         */
        function CopyService($q, creationService, policyService, persistenceService) {
            this.$q = $q;
            this.creationService = creationService;
            this.policyService = policyService;
            this.persistenceService = persistenceService;
        }

        CopyService.prototype.validate = function (object, parentCandidate) {
            if (!parentCandidate || !parentCandidate.getId) {
                return false;
            }
            if (parentCandidate.getId() === object.getId()) {
                return false;
            }
            return this.policyService.allow(
                "composition",
                parentCandidate.getCapability('type'),
                object.getCapability('type')
            );
        };
        
        /**
         * Will build a graph of an object and all of its composed objects in memory
         * @private
         * @param domainObject
         */
        CopyService.prototype.buildCopyGraph = function(domainObject, parent) {
            /* TODO: Use contextualized objects here.
                Parent should be fully contextualized, and either the
                original parent or a contextualized clone. The subsequent
                composition changes can then be performed regardless of
                whether it is the top level composition of the original
                parent being updated, or of one of the cloned children. */

            var clones = [],
                $q = this.$q,
                self = this;
            
            function clone(object) {
                return JSON.parse(JSON.stringify(object));
            }
            
            function copy(originalObject, originalParent) {
                var modelClone = clone(originalObject.getModel());
                modelClone.composition = [];
                modelClone.id = uuid();

                if (originalObject.hasCapability('composition')) {
                    return originalObject.useCapability('composition').then(function(composees){
                        return composees.reduce(function(promise, composee){
                            return promise.then(function(){
                                return copy(composee, originalObject).then(function(composeeClone){
                                    /*
                                    TODO: Use the composition capability for this. Just not sure how to contextualize the as-yet non-existent modelClone object.
                                     */
                                    composeeClone.location = modelClone.id;
                                    return modelClone.composition.push(composeeClone.id);
                                });
                            });
                        }, $q.when(undefined)).then(function (){
                            /* Todo: Move this outside of promise and avoid
                             duplication below */
                            clones.push({persistence: originalParent.getCapability('persistence'), model: modelClone});
                            return modelClone;
                        });
                    });
                } else {
                    clones.push({persistence: originalParent.getCapability('persistence'), model: modelClone});
                    return $q.when(modelClone);
                }
            };
            return copy(domainObject, parent).then(function(){
                return clones;
            });
        }

        function newPerform (domainObject, parent, progress) {
            var $q = this.$q,
                self = this;
            if (this.validate(domainObject, parent)) {
                progress("preparing");
                return this.buildCopyGraph(domainObject, parent)
                    .then(function(clones){
                        return $q.all(clones.map(function(clone, index){
                            progress("copying", clones.length, index);
                            return self.persistenceService.createObject(clone.persistence.getSpace(), clone.model.id, clone.model);
                        })).then(function(){ return clones});
                    })
                    .then(function(clones) {
                        var parentClone = clones[clones.length-1];
                        parentClone.model.location = parent.getId()
                        return $q.when(
                            parent.hasCapability('composition') &&
                            parent.getCapability('composition').add(parentClone.model.id)
                            .then(function(){
                                progress("copying", clones.length, clones.length);
                                parent.getCapability("persistence").persist()
                            }));
                });
            } else {
                throw new Error(
                    "Tried to copy objects without validating first."
                );
            }
        }

        CopyService.prototype.perform = newPerform;
        
        function oldPerform (domainObject, parent) {
            var model = JSON.parse(JSON.stringify(domainObject.getModel())),
                $q = this.$q,
                self = this;

            // Wrapper for the recursive step
            function duplicateObject(domainObject, parent) {
                return self.perform(domainObject, parent);
            }

            if (!this.validate(domainObject, parent)) {
                throw new Error(
                    "Tried to copy objects without validating first."
                );
            }

            if (domainObject.hasCapability('composition')) {
                model.composition = [];
            }

            return this.creationService
                .createObject(model, parent)
                .then(function (newObject) {
                    if (!domainObject.hasCapability('composition')) {
                        return;
                    }

                    return domainObject
                        .useCapability('composition')
                        .then(function (composees) {
                            // Duplicate composition serially to prevent
                            // write conflicts.
                            return composees.reduce(function (promise, composee) {
                                return promise.then(function () {
                                    return duplicateObject(composee, newObject);
                                });
                            }, $q.when(undefined));
                        });
                });
        };

        return CopyService;
    }
);


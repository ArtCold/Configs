(function () {
    'use strict';

    angular.module('app', [
        //'studiesService', 'sitesService', 'nvd3', 'dndLists'
    ]);

})();
(function () {
    'use strict';
    /// test artem ///
    angular
        .module('app')
        .controller('DocumentTracker', DocumentTracker);

    DocumentTracker.$inject = ['$scope', 'UserProfile', 'ListData', 'Util', 'Soap', 'Session', '$q', '$timeout', 'Settings'];

    function DocumentTracker($scope, UserProfile, ListData, Util, Soap, Session, $q, $timeout, Settings) {
        /* jshint validthis:true */
        var vm = this;
        vm.title = 'DocumentTracker';
        window.root = $scope;

        // Utils
        var getCurrentDate = function () {
            var date = new Date();
            return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
        };
        var setCurrentEmailReceiver = function () {
            var i = Util.getIndexByProp($scope.session.allApproversRaw, 'name', $scope.data.currentApprover.name);
            var approver = $scope.session.allApproversRaw[i];
            $scope.data.currentEmailReceiver = approver.poc ? approver.poc : $scope.data.currentApprover;
            $scope.data.isPoc = approver.poc ? 1 : 0;
        };
        var getFolderName = function () {
            return 'Item ' + $scope.data.id + ($scope.data.title ? (' - ' + $scope.data.title) : '');
        };

        // Properties
        $scope.data = {};
        $scope.data.attachments = [];
        $scope.data.status = 'Draft';
        $scope.session = {};
        $scope.lookups = {};
        $scope.session.submitted = false;
        $scope.session.today = new Date();
        $scope.loaded = { all: false };
        $scope.session.isViewMode = Session.isViewMode;
        $scope.session.webUrl = Session.getSiteUrl();
        $scope.session.settings = Settings;
        $scope.modalShown = false;

        // Methods
        $scope.constructor = function () {
            function getLookups() {
                return ListData.getAllItems(Settings.partnerAgencyListName).then(function (items) {
                    $scope.lookups.allPartnerAgencies = items.map(function (v) { return v['Title'] });
                });
            }
            function getCurrentUser() {
                return UserProfile.getCurrentUser().then(UserProfile.checkUserAdmin).then(function (isAdmin) {
                    $scope.session.currentUser = Session.getCurrentUser();
                    $scope.session.isCreator = false;
                    $scope.session.isEditor = false;
                    $scope.session.isApprover = false;
                    $scope.session.isAdmin = isAdmin;

                    // State and Editor
                    if ($scope.data.status == 'Draft') {
                        $scope.data.creator = $scope.session.currentUser;
                    }
                    else if ($scope.data.status == "New" && $scope.data.creator.name != $scope.session.currentUser.name) {
                        $scope.data.editor = $scope.session.currentUser;
                    }

                    // Creator and Editor
                    if ($scope.data.creator && $scope.data.creator.name == $scope.session.currentUser.name) {
                        $scope.session.isCreator = true;
                    } else
                        if ($scope.data.editor && $scope.data.editor.name == $scope.session.currentUser.name) {
                            $scope.session.isEditor = true;
                        }

                    // POC
                    $scope.session.pocOf = "";
                    $scope.session.signer = $scope.session.currentUser.name
                    var user = $scope.session.allApproversRaw.filter(function (f) { return f.poc && f.poc.name == $scope.session.currentUser.name })[0];
                    if (user) {
                        $scope.session.pocOf = user.name;
                        $scope.session.signer = $scope.session.signer + ' on behalf of ' + user.name;
                    }

                    // Approver
                    if ($scope.data.currentApprover && $scope.data.currentApprover.name == $scope.session.currentUser.name ||
                        $scope.data.currentEmailReceiver && $scope.data.currentEmailReceiver.name == $scope.session.currentUser.name)
                        $scope.session.isApprover = true;

                    var commentsCount = $scope.data.comments ? $scope.data.comments.length : 0;
                    $scope.data.futureComments = [];
                    for (var i = commentsCount; i < $scope.data.approvers.length; i++) {
                        if (!(i == commentsCount && $scope.session.isApprover)) {
                            $scope.data.futureComments.push({ name: $scope.data.approvers[i].name });
                        }
                    }
                });
            }
            function getAllApprovers() {
                var defer = $q.defer();
                ListData.getAllItems(Settings.approversListName).then(function (items) {
                    var arr = [];
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var approver = ListData.parseField(item, ListData.fields.approver);
                        if (!approver) continue
                        approver.poc = ListData.parseField(item, ListData.fields.poc);
                        arr.push(approver);
                    }
                    $scope.session.allApproversRaw = angular.copy(arr);
                    if ($scope.data.approvers) {
                        arr = arr.filter(function (el) {
                            return $scope.data.approvers.map(function (e) { return e.name; }).indexOf(el.name) < 0;
                        });
                    }
                    $scope.session.allApprovers = arr;
                    defer.resolve();
                });
                return defer.promise;
            }

            if (Session.isEditMode) {
                ListData.getCurrentItem().then(function (obj) {
                    $scope.data = angular.merge($scope.data, obj);
                    $scope.data.folderTempName = getFolderName();
                    $scope.master = angular.copy($scope.data);
                    var def = getAllApprovers().then(getCurrentUser);
                    $q.all([def]).then(function () { $scope.loaded.all = true; });
                    getLookups();
                });
            } else {
                var def = getAllApprovers().then(getCurrentUser);
                $q.all([def]).then(function () { $scope.loaded.all = true; });
                getLookups();
            }
        };
        $scope.goBackToList = function () {
            var s = window.location.href;
            var i = s.indexOf('/NewForm');
            if (i == -1) i = s.indexOf('/EditForm');
            var x = s.substr(0, i);
            window.location = x;
        };
        $scope.uploadAttachment = function (file, cat) {
            var reader = new FileReader();
            var filename = file.name;
            var timestamp = new Date().getTime();
            var prm = null;
            reader.onload = function (loadEvent) {
                $scope.$apply(function () {
                    $scope.data.folderTempName = $scope.data.folderTempName || timestamp;

                    function upload() {
                        Soap.postDocument(filename, $scope.data.folderTempName, loadEvent.target.result);
                        var isPdf = filename.endsWith('.pdf');
                        var title = filename.split('.')[0];
                        $scope.data.attachments.push({
                            filename: filename,
                            isPdf: isPdf,
                            title: title,
                            category: cat
                        });
                    }

                    if ($scope.data.attachments.length == 0) {
                        ListData.createFolder(Settings.documentLibraryName, $scope.data.folderTempName).then(upload);
                    } else {
                        upload();
                    }
                });
            }
            reader.readAsDataURL(file);
        }
        $scope.redirectEdit = function () {
            window.location = Session.getSiteUrl() + '/Lists/' + Session.getListTitle() + '/EditForm.aspx?ID=' + $scope.data.id
        };
        $scope.removeAttachment = function () {
            function deleteById(items) {
                var responses = [];
                for (var i = 0; i < items.length; i++) {
                    for (var j = 0; j < $scope.data.attachments.length; j++) {
                        var att = $scope.data.attachments[j];
                        if (items[i].FileRef.split('/').pop() == att.filename) {
                            responses.push(ListData.deleteItem(Settings.documentLibraryName, items[i].ID));
                        }
                    }
                }
                return $q.when(responses);
            }
            return ListData.getAllItems(Settings.documentLibraryName).then(deleteById);
        };
        $scope.saveComment = function () {
            $scope.data.comments.push({ name: $scope.session.signer, comment: $scope.data.newComment, date: getCurrentDate() });
        };
        $scope.showAlert = function (msg, stayOnPage) {
            $scope.modalMessage = msg;
            $scope.modalStay = !!stayOnPage;
            $scope.modalShown = !$scope.modalShown;
            return $q.when([]);
        };
        $scope.stopTracking = function () {
            $scope.data.previousAssignee = "";
            $scope.data.currentAssignee = "";
            return $scope.write();
        };
        $scope.toggleModal = function () {
            $scope.modalShown = !$scope.modalShown;
        };
        $scope.write = function () {
            var promise = Session.isEditMode ? ListData.updateItem($scope.data) : ListData.createItem($scope.data);
            return promise.then(function (item) {
                $scope.data.id = item.get_fieldValues().ID;
                if ($scope.data.folderTempName && $scope.data.folderTempName != $scope.data.id ||
                    $scope.data.folderTempName != buildFolderName()) {
                    return ListData.updateFolderInfo(Settings.documentLibraryName, $scope.data.folderTempName, getFolderName(), $scope.data.status, $scope.data.dueDate, $scope.data.partnerAgency);
                }
            });
        };

        // Buttons actions
        $scope.approve = function () {
            $scope.saveComment();
            var index = Util.getIndexByProp($scope.data.approvers, 'name', $scope.data.currentApprover.name);
            $scope.data.previousAssignee = $scope.session.signer;
            if (index < $scope.data.approvers.length - 1) {
                $scope.data.prevApprover = $scope.data.currentApprover.name != $scope.data.currentEmailReceiver.name ? $scope.data.currentApprover : null;
                $scope.data.currentApprover = $scope.data.approvers[index + 1];
                $scope.data.currentAssignee = $scope.data.currentApprover.name;
                $scope.data.nextAssignee = index < $scope.data.approvers.length - 2 ? $scope.data.approvers[index + 2].name : null;
                setCurrentEmailReceiver();
            } else {
                $scope.data.prevApprover = ($scope.data.previousAssignee != null && $scope.data.currentApprover.name != $scope.data.currentEmailReceiver.name) ? $scope.data.currentApprover : null;
                $scope.data.currentAssignee = $scope.data.creator.name;
                $scope.data.currentApprover = null;
                $scope.data.nextAssignee = null;
                $scope.data.currentEmailReceiver = null;
                $scope.data.status = "Complete";
            }
            $scope.session.submitted = true;
            $scope.data.wfCounter = -1;
            $scope.write().then(function () { $scope.showAlert("Your Tracker Item was successfully Approved and has moved forward in the workflow.") });
        };
        $scope.cancel = function () {
            $scope.goBackToList();
        };
        $scope.closeOut = function () {
            $scope.data.status = "Closed";
            $scope.session.submitted = true;
            $scope.data.closedOutDate = new Date();
            $scope.stopTracking().then(function () { $scope.showAlert("Your Tracker Item was successfully closed out. The attachments, if any, will be removed.") });
        };
        $scope.disapprove = function () {
            $scope.saveComment();
            $scope.data.nextAssignee = "";
            $scope.data.status = "Denied";
            $scope.session.submitted = true;
            $scope.stopTracking().then(function () { $scope.showAlert("Your Tracker Item has been successfully Disapproved and is going back to the initiator.") });
        };
        $scope.initiate = function () {
            $scope.data.currentApprover = $scope.data.approvers[0];
            $scope.data.currentAssignee = $scope.data.currentApprover.name;
            $scope.data.nextAssignee = $scope.data.approvers.length > 1 ? $scope.data.approvers[1].name : null;
            setCurrentEmailReceiver();
            $scope.data.initDate = new Date();
            $scope.data.status = "In Process";
            $scope.data.comments = [];
            $scope.session.submitted = true;
            $scope.data.wfCounter = -1;
            $scope.write().then(function () { $scope.showAlert("Your Tracker Item was successfully initiated.") }, function (e) {
                $scope.showAlert("An Error Occured. Please try again later.");
                ListData.deleteItem(Session.getListTitle(), $scope.data.id);
                ListData.deleteFolder(Settings.documentLibraryName, $scope.data.folderTempName);
            });
        };
        $scope.print = function () {
            window.print();
        };
        $scope.recall = function () {
            $scope.data.recalledBy = $scope.session.currentUser;
            $scope.data.status = "Recalled";
            $scope.session.submitted = true;
            $scope.stopTracking().then(function () { $scope.showAlert("Your Tracker Item was successfully recalled.") });
        };
        $scope.remove = function () {
            $scope.data.status = "Cancelled";
            $scope.session.submitted = true;
            $scope.stopTracking().then(function () { $scope.showAlert("Your Tracker Item was successfully removed from the system.") });
        };
        $scope.revert = function () {
            $scope.saveComment();
            $scope.data.status = "Reverted";
            $scope.session.submitted = true;
            $scope.stopTracking().then(function () { $scope.showAlert("Your Tracker Item was successfully Reverted and is going back to the initiator.") });
        };
        $scope.save = function () {
            $scope.data.status = "New";
            $scope.session.submitted = true;
            $scope.write().then(function () { $scope.redirectEdit(); },
            function (e) {
                $scope.showAlert("An Error Occured. Please try again later.");
                if ($scope.data.status == 'Draft') {
                    ListData.deleteItem(Session.getListTitle(), $scope.data.id);
                    ListData.deleteFolder(Settings.documentLibraryName, $scope.data.folderTempName);
                }
            });
        };

        // Constructor
        $scope.constructor();
    }
})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('mydatepickr', mydatepickr);
    
    function mydatepickr() {
        var directive = {
            require: "ngModel",
            restrict: "AE",
            scope: {
                ngModel: "=",
                cleanDate: "="
            },
            template: '<input ng-model="dueDate" ng-change="onDateChange()" type="text" readonly="true" class="dt-input-calendar" size="23">\
                        <div style="position: relative"></div>',
            controller: ['$scope', '$element', function (scope, element) {
                var config = {
                    'dateFormat': 'm/d/Y'
                }
                new datepickr(element.find('input')[0], config, element.find('div')[0]);
            }],
            link: function (scope, element, attrs, ngModel) {
                scope.onDateChange = function () {
                    ngModel.$setViewValue(scope.dueDate);
                    scope.cleanDate = new Date(scope.dueDate);
                    scope.cleanDate.setHours(23);
                    scope.cleanDate.setMinutes(59);
                };
                ngModel.$render = function () {
                    if (!ngModel.$modelValue) return;
                    var date = new Date(ngModel.$modelValue);
                    var newDate = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
                    ngModel.$modelValue = newDate;
                    scope.dueDate = ngModel.$modelValue;
                };
            }
        };
        return directive;
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .directive('fileread', fileread);

    function fileread () {
        var directive = {
            restrict: 'AE',
            transclude: true,
            replace: true,
            scope: {
                method: '&callback',
                category: '@category',
                label: '@label'
            },
            template: '<label class="upload-label">{{label}}<input class="file-input-hidden" type="file" accept=".doc,.docx,.pdf,.xls,.xlsx" /></label>',
            link: function (scope, element, attrs) {
                scope.expressionHandler = scope.method();
                element.bind("change", function (changeEvent) {
                    scope.$apply(function () {
                        scope.expressionHandler(changeEvent.target.files[0], scope.category);
                        angular.element(element).val(null);
                    });
                });
            }
        };
        return directive;
    }
})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('modalDialog', modalDialog);

    function modalDialog () {
        // Usage:
        //     <modalDialog></modalDialog>
        // Creates:
        // 
        var directive = {
            restrict: 'E',
            scope: {
                show: '=',
                message: '=',
                action: '='
            },
            replace: true, // Replace with the template below
            transclude: true, // we want to insert custom content inside the directive
            link: function (scope, element, attrs) {
                scope.hideModal = function () {
                    scope.show = false;
                    scope.action();
                };
            },
            template:
                '<div class="ng-modal" ng-show="show">\
                    <div class="ng-modal-overlay" ng-click="hideModal()">\
                        <div class="ng-modal-dialog" >\
                            <p>{{message}}</p>\
                            <input type="button" class="ng-modal-close" ng-click="hideModal()" value="OK" />\
                            <div class="ng-modal-dialog-content" ng-transclude></div>\
                        </div>\
                    </div>\
                </div>'
        };
        return directive;
    }
})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('myComments', myComments);

    function myComments () {
        var directive = {
            require: '?ngModel',
            template: '<p ng-repeat="comment in data.comments">{{::comment.Name}}: {{::comment.Comment}}</p>',
        };
        return directive;
    }

})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('myDoubleBox', myDoubleBox);

    myDoubleBox.$inject = ['$timeout', 'Util'];
    
    function myDoubleBox($timeout, Util) {
        var directive = {
            restrict: 'E',
            scope: {
                ngModel: '=',
                options: '=optionSource'
            },
            template: '<table class="dt-ctrl-approvers" border="1" align="center" style="border-collapse:collapse;"><tr valign="top"><td>' +
                '<select size="8" ng-dblclick="onClickRight()" ng-click="onClickSL()">' +
                    '<option ng-repeat="option1 in options | orderBy: \'name\' " value="{{option1.id}}">{{option1.name}}</option>' +
                '</select></td><td valign="middle">' +
                    '<input type="button" ng-click="onClickRight()" value=">" title="Move selected person right" ng-disabled="options.length==0 || rDisabled" style="width: 80px"/><br /><br />' +
                    '<input type="button" ng-click="onClickLeft()" value="<" title="Move selected person left" ng-disabled="ngModel.length==0 || lDisabled" style="width: 80px"/></td><td>' +
                '<select size="8" ng-dblclick="onClickLeft()" ng-click="onClickSR()" >' +
                    '<option ng-repeat="option2 in ngModel" value="{{option2.id}}">{{option2.name}}</option>' +
                '</select></td></tr><tr><td></td><td></td><td>' +
                    '<input type="button" value="Move Up" ng-click="moveUpDown(false)" title="Move the selected recipient up in the routing slip." ng-disabled="ngModel.length<=1 || uDisabled" />' +
                    '<input type="button" value="Move Down" ng-click="moveUpDown(true)" title="Move the selected recipient down in the routing slip." ng-disabled="ngModel.length<=1 || dDisabled" />' +
                '</td></tr></table>',
            controller: ['$scope', '$element', function (scope, element) {
                scope.ngModel = [];
                var sels = element.find('select');
                var selA = sels[0];
                var selB = sels[1];

                scope.rDisabled = true;
                scope.lDisabled = true;
                scope.uDisabled = true;
                scope.dDisabled = true;

                scope.onClickSL = function () {
                    scope.rDisabled = selA.selectedIndex == -1;
                }

                scope.onClickSR = function () {
                    scope.lDisabled = selB.selectedIndex == -1;
                    scope.dDisabled = selB.selectedIndex == -1 || selB.selectedIndex == selB.length - 1;
                    scope.uDisabled = selB.selectedIndex < 1;
                }

                scope.moveUpDown = function (isDown) {
                    var index = selB.selectedIndex;
                    if (index == -1) { console.log("Please select an option to move."); return; }
                    var temp = scope.ngModel[index];
                    if (isDown) {
                        scope.ngModel[index] = scope.ngModel[index + 1];
                        scope.ngModel[index + 1] = temp;
                        scope.dDisabled = index >= selB.length - 2;
                        scope.uDisabled = false;
                    } else {
                        scope.ngModel[index] = scope.ngModel[index - 1];
                        scope.ngModel[index - 1] = temp;
                        scope.uDisabled = index < 2;
                        scope.dDisabled = false;
                    }
                }

                scope.onClickLR = function (sel, arrFrom, arrTo) {
                    if (sel.selectedIndex < 0) { console.log("Please select an option to move."); return; }
                    var name = sel.options[sel.selectedIndex].text;
                    var index = Util.getIndexByProp(arrFrom, 'name', name);
                    if (index === -1) { console.log("Please select an option to move."); return; }
                    var item = arrFrom[index];
                    arrTo.push(item);
                    arrFrom.splice(index, 1);
                    sel.selectedIndex = -1;
                }

                scope.onClickRight = function () {
                    scope.onClickLR(selA, scope.options, scope.ngModel);
                    scope.rDisabled = true;
                };
                scope.onClickLeft = function () {
                    scope.onClickLR(selB, scope.ngModel, scope.options);
                    scope.lDisabled = true;
                    scope.uDisabled = true;
                    scope.dDisabled = true;
                };
            }]
        };
        return directive;
    }
})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('notzero', notzero);

    notzero.$inject = ['$window'];
    
    function notzero($window) {
        var directive = {
            link: link,
            restrict: 'EA',
            require: 'ngModel',
        };
        return directive;

        function link(scope, element, attrs, ngModel) {
            scope.$watch(function () {
                return ngModel.$modelValue && ngModel.$modelValue.length;
            }, function () {
                ngModel.$validate();
            });
            ngModel.$validators.length = function () {
                var arr = ngModel.$modelValue;
                if (!arr) { return false; }
                return arr > 0;
            };
        }
    }

})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('restrict', restrict);

    restrict.$inject = ['$parse'];
    
    function restrict($parse) {
        // Usage:
        //     <restrict></restrict>
        // Creates:
        // 
        var directive = {
            link: link,
            restrict: 'A',
            require: 'ngModel',
        };
        return directive;

        function link (scope, iElement, iAttrs, controller) {
            scope.$watch(iAttrs.ngModel, function (value) {
                if (!value) return; 
                $parse(iAttrs.ngModel).assign(scope, value.replace(new RegExp(iAttrs.restrict, 'g'), ' ').replace(/\s\s+/g, ' '));
            });
        }
    }

})();
(function() {
    'use strict';

    angular
        .module('app')
        .directive('superSelect', superSelect);

    superSelect.$inject = ['Settings', 'ListData'];
    
    function superSelect(Settings, ListData) {
        var directive = {
            restrict: 'E',
            require: "ngModel",
            scope: {
                ngModel: '=',
                allOptions: '=',
                sourceListName: '@sourceListName'
            },
            link: function (scope, element, attrs, ngModel) {
                scope.addOption = function () {
                    if (scope.allOptions.indexOf(scope.newOption) > -1) return;
                    if (typeof scope.newOption == 'undefined' || scope.newOption == '') return;
                    scope.allOptions.push(scope.newOption);
                    scope.ngModel = scope.newOption;
                    ListData.createItemCustom({ title: scope.newOption }, Settings[scope.sourceListName], function () {
                        scope.newOption = "";
                        scope.$apply();
                    });

                }
            },
            controller: function ($scope) {
                ListData.getAllItems(Settings.documentTypeListName).then(function (items) {
                    $scope.allOptions = items.map(function (v) { return v['Title'] });
                });
            },
            template:
                '<select class="dt-select-dropdown" ng-model="ngModel" ng-options="item as item for item in allOptions | orderBy" required>\
                </select>\
                <span  class="dt-label" >Other: </span>\
                <input type="text" ng-model="newOption"></input>\
                <input ng-disabled="!newOption || newOption.length == 0" type="button" ng-click="addOption()" value="Add" title="Add custom value to the dropbox"></input>'
        };
        return directive;
    }

})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('ListData', ListData);

    ListData.$inject = ['$q', 'Session', 'Util', 'Settings'];


    function ListData($q, Session, Util, Settings) {
        var fields = {
            'approver': { type: 'Person', name: 'Approver' },
            'approvers': { type: 'MultiPerson', name: 'Approvers' },
            'attachments': { type: 'JsonArray', name: 'AttachmentTitle', allowNull: true },
            'closedOutBy': { type: 'Person', name: 'ClosedOutBy' },
            'closedOutDate': { type: 'Date', name: 'ClosedOutDate' },
            'comments': { type: 'JsonArray', name: 'Comments' },
            'creator': { type: 'Person', name: 'Author', readOnly: true },
            'creatorComment': { type: 'Text', name: 'CreatorComment' },
            'currentApprover': { type: 'Person', name: 'CurrentApprover' },
            'currentAssignee': { type: 'Text', name: 'Current Assignee', allowNull: true },
            'currentEmailReceiver': { type: 'Person', name: 'CurrentEmailReceiver' },
            'documentType': { type: 'Text', name: 'Document Type' },
            'dueDate': { type: 'Date', name: 'Due Date' },
            'editor': { type: 'Person', name: 'Editor0' },
            'editorComment': { type: 'Text', name: 'EditorComment' },
            'id': { type: 'Number', name: 'ID', readOnly: true },
            'initDate': { type: 'Date', name: 'Request Date' },
            'isPoc': { type: 'Number', name: 'IsPoc', allowNull: true },
            'nextAssignee': { type: 'Text', name: 'Next Assignee', allowNull: true },
            'partnerAgency': { type: 'Text', name: 'Partner Agency' },
            'prevApprover': { type: 'Person', name: 'PrevApprover' },
            'poc': { type: 'Person', name: 'POC' },
            'previousAssignee': { type: 'Text', name: 'Previous Assignee', allowNull: true },
            'recalledBy': { type: 'Person', name: 'RecalledBy' },
            'recallReason': { type: 'Text', name: 'RecallReason' },
            'status': { type: 'Text', name: 'Status' },
            'title': { type: 'Text', name: 'Title' },
            'wfCounter': { type: 'Number', name: 'WFCounter' }
        };
        var parseDataToItem = function (data, item, _fields) {
            for (var key in _fields) {
                var field = _fields[key];
                if (field.readOnly) continue;
                if (field.defaultValue && !data.hasOwnProperty(key)) data[key] = field.defaultValue;
                if (!data.hasOwnProperty(key)) continue;
                var value = data[key];
                var afterValue;
                switch (field.type) {
                    case 'MultiLookup':
                        if (!value) continue;
                        var lookupsIds = typeof value == "string" ? value.split(',') : value;
                        var lookups = [];
                        for (var ii in lookupsIds) {
                            var lookupValue = new SP.FieldLookupValue();
                            lookupValue.set_lookupId(lookupsIds[ii]);
                            lookups.push(lookupValue);
                        }
                        afterValue = lookups;
                        break;
                    case 'Boolean':
                        afterValue = value == '1' ? 1 : 0;
                        break;
                    case 'JsonArray':
                        if (!value) continue;
                        afterValue = angular.toJson(value);
                        break;
                    case 'Person':
                        if (value) {
                            afterValue = SP.FieldUserValue.fromUser(value.title);
                            afterValue.set_lookupId(value.id);
                        } else {
                            afterValue = null;
                        }
                        break;
                    case 'Date':
                        if (!value) continue
                        afterValue = new Date(Date.parse(value));
                        break;
                    case 'MultiPerson':
                        if (!value) continue
                        var lookups = [];
                        var values = angular.fromJson(value);
                        for (var i = 0; i < values.length; i++) {
                            var lookupValue = SP.FieldUserValue.fromUser(values[i].title);
                            lookupValue.set_lookupId(values[i].id);
                            lookups.push(lookupValue);
                        }
                        afterValue = lookups;
                        break;
                    default:
                        if (!value && !field.allowNull) continue
                        afterValue = value;
                }
                var fieldName = field.name.replace(/ /g, '_x0020_');
                var fieldName = fieldName.replace('?', '_x003f_');
                item.set_item(fieldName, afterValue);
            }
            item.update();
        }
        var parseField = function (obj, field) {
            var fieldName = field.name.replace(/ /g, '_x0020_');
            var fieldName = fieldName.replace('?', '_x003f_');

            var val = obj[fieldName];

            switch (field.type) {
                case 'MultiLookup':
                    var s = [];
                    for (var i = 0; i < val.length; i++) {
                        var lv = val[i];
                        s.push(lv.get_lookupId());
                    }
                    val = s;
                    break;

                case 'JsonArray':
                    if (val == null) {
                        val = [];
                    } else {
                        val = JSON.parse(val);
                    }
                    break;

                case 'Person':
                    if (!val) return null;
                    var name = val.get_lookupValue();
                    var id = val.get_lookupId();
                    val = { name: Util.formatName(name), id: id, title: name };
                    break;

                case 'MultiPerson':
                    if (!val) return null;
                    var s = [];
                    for (var i = 0; i < val.length; i++) {
                        var lv = val[i];
                        var name = lv.get_lookupValue();
                        var id = lv.get_lookupId();
                        s.push({ name: Util.formatName(name), id: id, title: name });
                    }
                    val = s;
                    break;
            }

            return val;
        };
        var parseItemToData = function (item, attFiles) {
            var obj = item.get_fieldValues();
            var data = {};
            for (var key in fields) {
                var field = fields[key];
                var newVal = parseField(obj, field);
                if (newVal != null) data[key] = newVal;
            }
            return data;
        };
        var getAllItems = function (listTitle, loadQuery) {
            var deferred = $q.defer();
            SP.SOD.executeOrDelayUntilScriptLoaded(function () {
                var ctx = SP.ClientContext.get_current();
                var list = ctx.get_web().get_lists().getByTitle(listTitle);
                var query = SP.CamlQuery.createAllItemsQuery();
                var items = list.getItems(query);
                if (loadQuery) {
                    ctx.load(items, loadQuery);
                } else {
                    ctx.load(items);
                }
                ctx.executeQueryAsync(
                    function () {
                        var arr = [];
                        for (var i = 0; i < items.get_count() ; i++) {
                            var item = items.getItemAtIndex(i);
                            arr.push(item.get_fieldValues());
                        }
                        deferred.resolve(arr);
                    },
                    function (e) {
                        console.log('Error: ' + e);
                    }
                );
            }, 'SP.js');
            return deferred.promise;
        };
        var createFolder = function (listTitle, folderName) {
            var deferred = $q.defer();
            var ctx = SP.ClientContext.get_current();
            var list = ctx.get_web().get_lists().getByTitle(listTitle);
            var rootFolder = list.get_rootFolder();
            var curFolder = rootFolder.get_folders().add(folderName);
            ctx.load(curFolder);
            ctx.executeQueryAsync(function () {
                deferred.resolve(curFolder);
            }, function () {
                deferred.reject('Unable to create folder in ' + listTitle);
            });
            return deferred.promise;
        };
        var createItem = function (data) {
            return createItemCustom(data, Session.getListTitle(), function (item) {
                var oData = item.get_objectData();
                var id = Session.isSp2013 ? id = oData.get_properties().Id :
                    oData.$X_0.get_identity().split(',')[0].split('item')[1].substring(1);
                Session.setItemId(id);
            });
        };
        var createItemCustom = function (data, listTitle, success) {
            var deferred = $q.defer();
            var ctx = SP.ClientContext.get_current();
            var item = ctx.get_web().get_lists().getByTitle(listTitle).addItem();
            parseDataToItem(data, item, fields);
            ctx.load(item);
            ctx.executeQueryAsync(function () {
                if (success)
                    success(item);
                deferred.resolve(item);
            }, function (e) {
                deferred.reject(e);
            });
            return deferred.promise;
        };
        var getAttachment = function () {
            var deferred = $q.defer();
            var ctx = SP.ClientContext.get_current();
            var attachmentFolder = ctx.get_web().getFolderByServerRelativeUrl('Lists/' + Session.getListTitle() + '/Attachments/' + Session.getItemId());
            var attachmentFiles = attachmentFolder.get_files();
            ctx.load(attachmentFiles);
            ctx.executeQueryAsync(function () {
                var file = attachmentFiles.getItemAtIndex(0);
                var name = file.get_name();
                var url = file.get_serverRelativeUrl();
                var attach = { name: name, url: url };
                deferred.resolve(attach);
            });
            return deferred.promise;
        };
        var getCurrentItem = function () {
            var deferred = $q.defer();
            SP.SOD.executeOrDelayUntilScriptLoaded(function () {
                var ctx = SP.ClientContext.get_current();
                var item = ctx.get_web().get_lists().getByTitle(Session.getListTitle()).getItemById(Session.getItemId());
                ctx.load(item);
                ctx.executeQueryAsync(function () {
                    var obj = parseItemToData(item);
                    deferred.resolve(obj);
                }, function (e) {
                    deferred.reject(e);
                });
            }, 'SP.js');
            return deferred.promise;
        };
        var updateFolderInfo = function (listTitle, oldTitle, newTitle, status, dueDate, partnerAgency) {
            var item;
            var deferred = $q.defer();
            var ctx = new SP.ClientContext.get_current();
            var items = ctx.get_web().get_lists().getByTitle(listTitle).getItems(SP.CamlQuery.createAllFoldersQuery());
            ctx.load(items);
            ctx.executeQueryAsync(function () {
                var item;
                for (var i = 0; i < items.get_count() ; i++) {
                    item = items.getItemAtIndex(i);
                    if (item.get_fieldValues().FileLeafRef == oldTitle) {
                        item.set_item("FileLeafRef", newTitle);
                        item.set_item(Settings.documentLibraryFields.status.name, status);
                        item.set_item(Settings.documentLibraryFields.dueDate.name, dueDate);
                        if (partnerAgency) item.set_item(Settings.documentLibraryFields.partnerAgency.name, partnerAgency);
                        item.update();
                        break;
                    }
                }
                ctx.executeQueryAsync(function () {
                    deferred.resolve(item);
                }, function (e) {
                    deferred.reject(e);
                });
            });
            return deferred.promise;
        };
        var deleteFolder = function (listTitle, title) {
            var item;
            var deferred = $q.defer();
            var ctx = new SP.ClientContext.get_current();
            var items = ctx.get_web().get_lists().getByTitle(listTitle).getItems(SP.CamlQuery.createAllFoldersQuery());
            ctx.load(items);
            ctx.executeQueryAsync(function () {
                var item;
                for (var i = 0; i < items.get_count() ; i++) {
                    item = items.getItemAtIndex(i);
                    if (item.get_fieldValues().FileLeafRef == title) {
                        item.deleteObject();
                        break;
                    }
                }
                ctx.executeQueryAsync(function () {
                    deferred.resolve(item);
                }, function (e) {
                    deferred.reject(e);
                });
            });
            return deferred.promise;
        };
        var updateItem = function (data) {
            var deferred = $q.defer();
            var ctx = SP.ClientContext.get_current();
            var item = ctx.get_web().get_lists().getByTitle(Session.getListTitle()).getItemById(Session.getItemId());
            parseDataToItem(data, item, fields);
            ctx.load(item);
            ctx.executeQueryAsync(function () {
                deferred.resolve(item);
            }, function (sender, args) {
                alert('Request failed. ' + args.get_message());
                deferred.reject(args);
            });
            return deferred.promise;
        };
        var updateFolderFields = function (listTitle, newTitle, status, dueDate) {
            var item;
            var deferred = $q.defer();
            var ctx = new SP.ClientContext.get_current();
            var items = ctx.get_web().get_lists().getByTitle(listTitle).getItems(SP.CamlQuery.createAllFoldersQuery());
            ctx.load(items);
            ctx.executeQueryAsync(function () {
                var item;
                for (var i = 0; i < items.get_count() ; i++) {
                    item = items.getItemAtIndex(i);
                    if (item.get_fieldValues().FileLeafRef == newTitle) {
                        item.set_item("Status", status);
                        item.set_item("DueDate", dueDate);
                        item.update();
                        break;
                    }
                }
                ctx.executeQueryAsync(function () {
                    deferred.resolve(item);
                }, function (e) {
                    deferred.reject(e);
                });
            });
            return deferred.promise;
        };
        var deleteItem = function (listTitle, id) {
            var deferred = $q.defer();
            var ctx = SP.ClientContext.get_current();
            var item = ctx.get_web().get_lists().getByTitle(listTitle).getItemById(id);
            item.deleteObject();
            ctx.executeQueryAsync(function () {
                deferred.resolve();
            }, function (e) {
                deferred.reject(e);
            });
            return deferred.promise;
        };
        return {
            fields: fields,
            getAllItems: getAllItems,
            createFolder: createFolder,
            createItem: createItem,
            createItemCustom: createItemCustom,
            deleteFolder: deleteFolder,
            deleteItem: deleteItem,
            getAttachment: getAttachment,
            getCurrentItem: getCurrentItem,
            updateFolderInfo: updateFolderInfo,
            updateItem: updateItem,
            parseField: parseField,
            parseItemToData: parseItemToData
        };
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('Session', Session);

    Session.$inject = ['Util'];

    function Session(Util) {
        var currentUser = null;
        var listTitle = null;
        var itemId = null;
        var isEditMode = window.location.pathname.indexOf('EditForm.aspx') > -1 || window.location.pathname.indexOf('DispForm.aspx') > -1;
        var isSp2013 = _spPageContextInfo.webUIVersion == 15;
        var isViewMode = window.location.pathname.indexOf('DispForm.aspx') > -1;
        var getCurrentUser = function () {
            return currentUser;
        };
        var getListTitle = function () {
            if (!listTitle) {
                var ar = window.location.pathname.split('/');
                listTitle = ar[ar.indexOf("Lists") + 1];
                var find = "%20";
                var regex = new RegExp(find, "g");
                listTitle = listTitle.replace(regex, " ");
            }
            return listTitle;
        };
        var getItemId = function () {
            if (!itemId)
                itemId = Util.getUrlParameterByName('ID');
            return itemId;
        };
        var getSiteUrl = function () {
            return getOriginUrl() + _spPageContextInfo.webServerRelativeUrl;
        };
        var getOriginUrl = function () {
            if (!window.location.origin) {
                window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
            }
            return window.location.origin;
        };
        var setItemId = function (id) {
            itemId = id;
        };
        var setCurrentUser = function (user) {
            currentUser = user;
        };

        return {
            isEditMode: isEditMode,
            isSp2013: isSp2013,
            isViewMode: isViewMode,
            getCurrentUser: getCurrentUser,
            getListTitle: getListTitle,
            getItemId: getItemId,
            getOriginUrl: getOriginUrl,
            getSiteUrl: getSiteUrl,
            setItemId: setItemId,
            setCurrentUser: setCurrentUser
        };
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('Settings', Settings);

    function Settings() {
        return {
            adminGroupid: 109,
            approversListName: "Document Tracker Approvers",
            documentTypeListName: "Document Tracker Document Types",
            documentLibraryName: "NIGMS Documents",
            partnerAgencyListName: "Partner Agencies",
            documentFilterQuery: "Forms/AllItems.aspx?FilterField1=Title&FilterValue1=",
            documentLibraryFields: {
                'status': { type: 'Text', name: 'Status' },
                'dueDate': { type: 'Date', name: 'DueDate' },
                'partnerAgency': { type: 'Text', name: 'Partner_x0020_Agency' }
            }
        }
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('Soap', Soap);

    Soap.$inject = ['$q', 'Session', 'Settings'];

    function Soap($q, Session, Settings) {
        return {
            deleteAttachment: function (file) {
                var deferred = $q.defer();
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open('POST', Session.getSiteUrl() + '/_vti_bin/Lists.asmx', true);
                xmlhttp.setRequestHeader("SOAPAction", "http://schemas.microsoft.com/sharepoint/soap/DeleteAttachment");
                xmlhttp.setRequestHeader("Content-Type", 'text/xml; charset="utf-8"');

                var url = Session.getOriginUrl() + file.url;
                var cleanUrl = url.replace(/([^:]\/)\/+/g, "$1");

                var sr =
                    '<?xml version="1.0" encoding="utf-8"?>' +
                    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                        '<soap:Body>' +
                        '<DeleteAttachment xmlns="http://schemas.microsoft.com/sharepoint/soap/">' +
                                '<listName>' + Session.getListTitle() + '</listName>' +
                                '<listItemID>' + Session.getItemId() + '</listItemID>' +
                                '<url>' + cleanUrl + '</url>' +
                            '</DeleteAttachment>' +
                        '</soap:Body>' +
                    '</soap:Envelope>';

                xmlhttp.onreadystatechange = function () {
                    if (xmlhttp.readyState == 4) {
                        if (xmlhttp.status == 200) {
                            console.log(xmlhttp.responseText);
                            deferred.resolve(xmlhttp.responseText);
                        }
                    }
                    // TODO: add reject promise
                }
                xmlhttp.send(sr);
                return deferred.promise;
            },
            postItemAttachment: function (filename, binaryString) {
                var deferred = $q.defer();
                var xmlhttp = new XMLHttpRequest();
                var data = binaryString.split(',')[1];
                var url = Session.getSiteUrl() + '/_vti_bin/Lists.asmx';
                var cleanUrl = url.replace(/([^:]\/)\/+/g, "$1");

                xmlhttp.open('POST', cleanUrl, true);
                xmlhttp.setRequestHeader("SOAPAction", "http://schemas.microsoft.com/sharepoint/soap/AddAttachment");
                xmlhttp.setRequestHeader("Content-Type", 'text/xml; charset="utf-8"');

                var sr =
                    '<?xml version="1.0" encoding="utf-8"?>' +
                    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                        '<soap:Body>' +
                        '<AddAttachment xmlns="http://schemas.microsoft.com/sharepoint/soap/">' +
                            '<listName>' + Session.getListTitle() + '</listName>' +
                            '<listItemID>' + Session.getItemId() + '</listItemID>' +
                            '<fileName>' + filename + '</fileName>' +
                            '<attachment>' + data + '</attachment>' +
                        '</AddAttachment>' +
                        '</soap:Body>' +
                    '</soap:Envelope>';

                xmlhttp.onreadystatechange = function () {
                    if (xmlhttp.readyState == 4) {
                        if (xmlhttp.status == 200) {
                            deferred.resolve(xmlhttp.responseText);
                        }
                    }

                    // TODO: add reject promise
                }
                xmlhttp.send(sr);
                return deferred.promise;
            },
            postDocument: function (filename, folder, binaryString) {
                var cleanUrl = function (u) { return u.replace(/([^:]\/)\/+/g, "$1") };
                var deferred = $q.defer();
                var xmlhttp = new XMLHttpRequest();
                var data = binaryString.split(',')[1];
                var serviceUrl = cleanUrl(Session.getSiteUrl() + '/_vti_bin/Copy.asmx');
                var fileUrl = cleanUrl(Session.getSiteUrl() + '/' + Settings.documentLibraryName + '/' + folder + '/' + filename);
                var title = filename.replace(/\.[^/.]+$/, "");

                xmlhttp.open('POST', serviceUrl, true);
                xmlhttp.setRequestHeader("SOAPAction", "http://schemas.microsoft.com/sharepoint/soap/CopyIntoItems");
                xmlhttp.setRequestHeader("Content-Type", 'text/xml; charset="utf-8"');

                var sr = '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> \
                    <soap:Body>\
                        <CopyIntoItems xmlns="http://schemas.microsoft.com/sharepoint/soap/">\
                            <SourceUrl>' + filename + '</SourceUrl>\
                                <DestinationUrls>\
                                    <string>' + fileUrl + '</string>\
                                </DestinationUrls>\
                                <Fields>\
                                    <FieldInformation Type="Text" DisplayName="Title" InternalName="Title" Value="' + title + '"  />\
                                </Fields>\
                            <Stream>' + data + '</Stream>\
                        </CopyIntoItems>\
                    </soap:Body>\
                </soap:Envelope>';

                xmlhttp.onreadystatechange = function () {
                    if (xmlhttp.readyState == 4) {
                        if (xmlhttp.status == 200) {
                            deferred.resolve(xmlhttp.responseText);
                        }
                    }
                    // TODO: add reject promise
                }
                xmlhttp.send(sr);
                return deferred.promise;
            }
        }
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('UserProfile', UserProfile);

    UserProfile.$inject = ['$q', 'Settings', 'Session', 'Util'];

    function UserProfile($q, Settings, Session, Util) {
        var getCurrentUser = function () {
            var deferred = $q.defer();
            SP.SOD.executeOrDelayUntilScriptLoaded(function () {
                var context = new SP.ClientContext.get_current();
                var web = context.get_web();
                var currentUser = web.get_currentUser();
                currentUser.retrieve();
                context.load(web);
                context.executeQueryAsync(
                    function () {
                        var userObject = web.get_currentUser();
                        var title = userObject.get_title();
                        var id = userObject.get_id();
                        var user = { name: Util.formatName(title), id: id, title: title };
                        Session.setCurrentUser(user);
                        deferred.resolve(user);
                    },
                    function () {
                        console.log('Error: ' + args.get_message() + '\n' + args.get_stackTrace());
                    }
                );
            }, 'SP.js');
            return deferred.promise;
        };
        var checkUserAdmin = function (user) {
            var deferred = $q.defer();
            SP.SOD.executeOrDelayUntilScriptLoaded(function () {
                try {
                    var ctx = SP.ClientContext.get_current();
                    var group = ctx.get_web().get_siteGroups().getById(Settings.adminGroupid);
                    ctx.load(group, 'Users');
                    ctx.executeQueryAsync(
                        function (sender, args) {
                            var found = false;
                            var e = group.get_users().getEnumerator();
                            while (e.moveNext()) {
                                var admin = e.get_current();
                                if (admin.get_title() == user.title) {
                                    found = true;
                                    break;
                                }
                            }
                            deferred.resolve(found);
                        },
                        function (e) {
                            deferred.resolve(false);
                        });
                } catch (e) {
                    deferred.resolve(false);
                }
            }, 'SP.js');
            return deferred.promise;
        }
        return {
            getCurrentUser: getCurrentUser,
            checkUserAdmin: checkUserAdmin
        };
    }
})();
(function () {
    'use strict';

    angular
        .module('app')
        .factory('Util', Util);

    function Util() {
        var getUrlParameterByName = function (name) {
            name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                results = regex.exec(location.search);
            return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        }
        var formatName = function (n) {
            var n = n.split('(')[0].split(',');
            return (n[1] ? n[1].trim() + ' ' : '') + n[0];
        };
        var getIndexByProp = function (array, prop, value) {
            for (var i = 0; i < array.length; i += 1) {
                if (array[i][prop] === value) return i;
            }
            return -1;
        };
        return {
            getIndexByProp: getIndexByProp,
            getUrlParameterByName: getUrlParameterByName,
            formatName: formatName
        }
    }
})();
var pickerSelector = 'span.ms-usereditor';
var containerSelector = 'span.ms-usereditor';
var buttonCaption = 'Create secured folder';
var listTitle = 'Test';
var loginTrimStr = 'i:0#.w|';
var usersGroupTitle = 'Data Call Users';
var spform;

var createButton = function (parentNode, title, action) {
    var button = jQuery('<input type="button" value="' + title + '" class="dc-form-button"/>');
    button.on("click", action);
    jQuery(button).insertAfter(parentNode);
};

var createFolder = function (webRelativeUrl) {
    var def = jQuery.Deferred();
    jQuery.ajax({
        "url": _spPageContextInfo.webAbsoluteUrl + "/_api/Web/Folders/add('" + webRelativeUrl + "')",
        "type": "POST",
        "headers": {
            "accept": "application/json; odata=verbose",
            "content-type": "application/json; odata=verbose",
            "X-RequestDigest": jQuery("#__REQUESTDIGEST").val()
        }
    }).done(function (data) {
        var url = data.d.ListItemAllFields.__deferred.uri;
        def.resolve(url);
    });
    return def;
};

var getJsonAtUrl = function (url) {
    var def = jQuery.Deferred();
    jQuery.ajax({
        "url": url,
        "type": "GET",
        "headers": {
            "accept": "application/json; odata=verbose",
            "content-type": "application/json; odata=verbose",
        }
    }).done(function (data) {
        def.resolve(data.d);
    }).error(function (data) {
        if (data.status == '404')
            def.reject(data);
        def.reject();
    });
    return def;
};

var addUserToGroup = function (login) {
    var def = jQuery.Deferred();
    var ctx = SP.ClientContext.get_current();;
    var groupCollection = ctx.get_web().get_siteGroups();
    var visitorsGroup = groupCollection.getByName(usersGroupTitle);
    var ensuredUser = ctx.get_web().ensureUser(login);
    var userCollection = visitorsGroup.get_users();
    var user = userCollection.addUser(ensuredUser);
    ctx.load(user);
    ctx.executeQueryAsync(function (data) {
        def.resolve(user);
    });
    return def;
};

var setUniquePermissions = function (id, login) {
    addUserToGroup(login).then(function (user) {
        var ctx = SP.ClientContext.get_current();
        var list = ctx.get_web().get_lists().getByTitle(listTitle);
        var item = list.getItemById(id);
        item.breakRoleInheritance(false, false);
        var bindings = SP.RoleDefinitionBindingCollection.newObject(ctx);
        bindings.add(ctx.get_web().get_roleDefinitions().getByType(SP.RoleType.administrator));
        item.get_roleAssignments().add(user, bindings);
        ctx.executeQueryAsync(function (e, g) { console.log(e, g) });
    });
};

var ensureResource = function(url, doesntExist) {
    var res= jQuery.Deferred();
    var exists = !doesntExist;
    var def = getJsonAtUrl(url);
    def.fail(function (data) {
        if (data.status == 404) {
            if (exists) {
                res.reject();
            } else {
                res.resolve();
            }
        } 
    });
    def.done(function() {
        if (exists) {
            res.resolve();
        } else {
            res.reject();
        }
    });
    return res;
}

var provisionSecuredFolder = function () {
    var login = spform.get('Assignee');
    var folderTitle = spform.get('Folder Title');
    if (!login || !folderTitle) return;
    console.log(spform, login, folderTitle);

    var url  = _spPageContextInfo.webAbsoluteUrl + "/_api/Web/GetFolderByServerRelativeUrl('" + _spPageContextInfo.webServerRelativeUrl + "/" + listTitle + "/" + folderTitle + "')";
    ensureResource(url, true).fail(function () {
        alert('Folder with that name already exists');
    }).then(function () {
        return createFolder(listTitle + "/" + folderTitle);
    }).then(function (url) {
        spform.set('Folder Url', _spPageContextInfo.webAbsoluteUrl + '/' + listTitle + '/' + folderTitle);
        return getJsonAtUrl(url);
    }).then(function (listItem) {
         setUniquePermissions(listItem.ID, login);
    });
};

var attrToJson = function (dom) {
    var attributes = dom.attributes;
    var obj = {};

    for (var i = 0, len = attributes.length; i < len; i++) {
        obj[attributes[i].name] = attributes[i].value;
    }
    return obj;
};

var getSpForm = function () {
    var dto = {};
    jQuery('.ms-formbody').each(function (i, el) {
        var div = jQuery(el);
        var comment = div.contents().filter(function () { return this.nodeType === 8; }).get(0);
        if (!comment) return true;
        var obj = attrToJson(jQuery('<div' + comment.nodeValue + ' />').get(0));
        var jel = jQuery(el);
        var input = jel.find('input').first();
        obj.input = input;
        dto[obj.fieldname] = obj;
    });
    dto.get = function (key) {
        if (dto.hasOwnProperty(key)) {
            var obj = dto[key];
            switch (obj.fieldtype) {
                case 'SPFieldText':
                    return obj.input.val();

                case 'SPFieldUser':
                    var picker = obj.input.parent().find(pickerSelector).first();
                    var inputId = picker.attr('id').replace('_UserField', '_UserField_hiddenSpanData');
                    var hidden = jQuery('#' + inputId);
                    var markup = hidden.val();
                    markup = markup.replace(/&nbsp;/g, '');
                    markup = markup.substring(0, markup.lastIndexOf(';'));
                    var dom = jQuery('<div/>').html(markup);
                    var valDiv = dom.find('div').first();
                    var login = valDiv.attr('key');
                    return login ? login.replace(loginTrimStr, '') : null;
                default: return obj.input.val();
            }
        }
        return null;
    };
    dto.getElement = function (key) {
        if (dto.hasOwnProperty(key) && dto[key].input)
            return dto[key].input;
        return null;
    };
    dto.set = function (key, val) {
        if (dto.hasOwnProperty(key))
            dto[key].input.val(val);
    }
    return dto;
};

window.onload = function () {
    spform = getSpForm();
    var el = spform.getElement('Folder Title');
    createButton(el, buttonCaption, provisionSecuredFolder);
};

// ensure folder not exist
    // use getJsonAtUrl: modify and add reject.. work on reject
// disable stuff around
// give folder access to Requestor -- auto
// disable everything except for Status for the assignee
// refactor 3
// add settings mode (rip from service catalog and refactor)

var pickerSelector = 'span.ms-usereditor';
var containerSelector = 'span.ms-usereditor';
var buttonCaption = 'Create secured folder';
var listTitle = 'Test';
var loginTrimStr = 'i:0#.w|';
var usersGroupTitle = 'Data Call Users';

var createButton = function (parentNode, title, action) {
    var button = document.createElement("input");
    button.type = "button";
    button.value = title;
    button.onclick = action;
    parentNode.append(button);
};

var getLoginFromPicker = function () {
    var picker = jQuery(pickerSelector).first();
    var id = picker.attr('id');
    var inputId = id.replace('_UserField', '_UserField_hiddenSpanData')
    var hidden = jQuery('#' + inputId);
    var markup = hidden.val();
    markup = markup.replace(/&nbsp;/g, '');
    markup = markup.substring(0, markup.lastIndexOf(';'));
    var dom = jQuery('<div/>').html(markup);
    var valDiv = dom.find('div').first();
    var login = valDiv.attr('key');
    return login;
};

var createFolder = function (webRelativeUrl) {
    var def = jQuery.Deferred();
    jQuery.ajax({
        "url": _spPageContextInfo.webAbsoluteUrl + "/_api/Web/Folders/add('" + webRelativeUrl + "')",
        "type": "POST",
        "headers": {
            "accept": "application/json; odata=verbose",
            "content-type": "application/json; odata=verbose",
            "X-RequestDigest": $("#__REQUESTDIGEST").val()
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

var formatLogin = function (login) {
    login = login.replace(loginTrimStr, '');
    return login;
}

var dowork = function () {
    var login = formatLogin(getLoginFromPicker());
    if (!login) return;

    createFolder(listTitle + "/Test1")
    .then(getJsonAtUrl)
    .then(function (listItem) {
        setUniquePermissions(listItem.ID, login);
    });
}

window.onload = function () {
    var picker = jQuery(containerSelector).first();
    var el = picker.parent();
    createButton(el, buttonCaption, dowork);
};

// get title from input form
// refactor 2
// attach or highjack or disable
// add value url of the folder
// refactor 3

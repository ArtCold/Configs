var ctx = SP.ClientContext.get_current();
var lists = ctx.get_web().get_lists();

ctx.load(lists);
ctx.executeQueryAsync(f1);

function f1() {
	for (var i = 0; i < lists.get_count(); i++) {
		var list = lists.getItemAtIndex(i);
		ctx.load(list,'HasUniqueRoleAssignments'); 
	}
	ctx.executeQueryAsync(
		function() {
			for (var i = 0; i < lists.get_count(); i++) {
				var list = lists.getItemAtIndex(i);
				var hasUniqueAssgns = list.get_hasUniqueRoleAssignments();
				if (hasUniqueAssgns) {
				    console.log(list.get_title() + ' = ' + hasUniqueAssgns);
				    var url = location.origin + list.get_defaultViewUrl();
				    url = url.replace(/ /g, '%20');
				    console.log('List level permissions = ' + hasUniqueAssgns, url);
				}
				checkItems(list);
			}
		}, 
		function(sender,args){
			console.log(args.get_message());    
		}
	);	
}

function checkItems(list) {
    var query = SP.CamlQuery.createAllItemsQuery();
    var items = list.getItems(query);
    ctx.load(items, "Include(HasUniqueRoleAssignments,ID)");
    ctx.load(items);
    ctx.executeQueryAsync(function () {
        for (var i = 0; i < items.get_count() ; i++) {
            var item = items.getItemAtIndex(i);
            var hasUniqueAssgns = item.get_hasUniqueRoleAssignments();
            if (hasUniqueAssgns) {
                var q = 'RootFolder=' + item.get_fieldValues().FileDirRef;
                var url = location.origin + _spPageContextInfo.webServerRelativeUrl + list.get_title() + '/Forms/AllItems.aspx?' + q + '&FilterField1=ID&FilterValue1=' + item.get_id();
                url = url.replace(/ /g, '%20');
                console.log('item level permissions = ' + hasUniqueAssgns, url);
            }
        }
    });
}

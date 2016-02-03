clear();
var timer;
var content = [];
var ctx = SP.ClientContext.get_current();
var mainWeb = ctx.get_web();
resetTimer();
checkWeb(mainWeb);

function report() {
    exportToCsv('report.csv', content);
}

function log(type, url) {
    url = location.origin + url.replace(/ /g, '%20');
    content.push([type, url]);
    console.log('Unique permissions found:',type, url);
}

function checkWebContent(web) {
    var webUrl = web.get_serverRelativeUrl();
    var lists = web.get_lists();
    ctx.load(lists);
    ctx.executeQueryAsync(function () {
        resetTimer();
        for (var i = 0; i < lists.get_count() ; i++) {
            var list = lists.getItemAtIndex(i);
            ctx.load(list, 'HasUniqueRoleAssignments');
        }
        ctx.executeQueryAsync(
		    function () {
		        resetTimer();
		        for (var i = 0; i < lists.get_count() ; i++) {
		            var list = lists.getItemAtIndex(i);
		            var hasUniqueAssgns = list.get_hasUniqueRoleAssignments();
		            if (hasUniqueAssgns) {
		                var url = list.get_defaultViewUrl();
		                log('List', url);
		            }
		            checkItems(list);
		        }
		    },
		    function (sender, args) {
		        resetTimer();
		        console.log(args.get_message());
		    }
	    );
    });
}

function checkItems(list) {
    var query = SP.CamlQuery.createAllItemsQuery();
    var items = list.getItems(query);
    ctx.load(items, "Include(HasUniqueRoleAssignments,ID)");
    ctx.load(items);
    ctx.executeQueryAsync(
        function () {
            resetTimer();
            for (var i = 0; i < items.get_count() ; i++) {
                var item = items.getItemAtIndex(i);
                var hasUniqueAssgns = item.get_hasUniqueRoleAssignments();
                if (hasUniqueAssgns) {
                    var q = 'RootFolder=' + item.get_fieldValues().FileDirRef;
                    var url = list.get_defaultViewUrl() + '?' + q + '&FilterField1=ID&FilterValue1=' + item.get_id();
                    log('Item', url);
                }
            }
        },
		function (sender, args) {
		    resetTimer();
		    console.log(args.get_message());
		}
    );
}

function checkWeb(parentWeb) {
    try {
        var hasUniqueAssgns = parentWeb.get_hasUniqueRoleAssignments();
        if (hasUniqueAssgns) {
            var url = parentWeb.get_serverRelativeUrl();
            log('Web', url);
        }
    } catch (e) {
        console.log(e);
    }
    
    var webs = parentWeb.get_webs();
    ctx.load(webs, "Include(HasUniqueRoleAssignments, Webs, Title, ServerRelativeUrl )");
    ctx.executeQueryAsync(
        function () {
            totalRequests += webs.get_count();
            for (var i = 0; i < webs.get_count() ; i++) {
                var web = webs.getItemAtIndex(i);
                checkWeb(web);
                checkWebContent(web);
            }
        },
        function (sender, args) {
            resetTimer();
            console.log(args.get_message());
        }
    );
}

function exportToCsv(filename, rows) {
    var processRow = function (row) {
        var finalVal = '';
        for (var j = 0; j < row.length; j++) {
            var innerValue = row[j] === null ? '' : row[j].toString();
            if (row[j] instanceof Date) {
                innerValue = row[j].toLocaleString();
            };
            var result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0)
                result = '"' + result + '"';
            if (j > 0)
                finalVal += ',';
            finalVal += result;
        }
        return finalVal + '\n';
    };

    var csvFile = '';
    for (var i = 0; i < rows.length; i++) {
        csvFile += processRow(rows[i]);
    }

    var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(report, 10000)
}

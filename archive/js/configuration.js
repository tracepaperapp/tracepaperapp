var api_url = "";
var api_ws = "";
var api_key = "";
var bucket = "";
var stage = ""

console.trace = function(){};
//console.log = function(){};
//console.warning = function(){};
//console.error = function(){};

if (!localStorage["staging-environment"] || localStorage["staging-environment"] == "false"){
	console.log("Connected to production");
	stage = "production";
	bucket = "";
	localStorage["aws-congnito-user-pool-id"] = "eu-west-1_RyjVm4Mka";
	localStorage["aws-congnito-app-id"] = "1j28c3eth1k38lj392el22h264";
	localStorage["aws-congnito-ui"] = "https://tracepapertwee-production.auth.eu-west-1.amazoncognito.com";
	api_url = "https://gff2zn67jfa3xeb45ndbt6arvi.appsync-api.eu-west-1.amazonaws.com/graphql";
	api_ws = "wss://gff2zn67jfa3xeb45ndbt6arvi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql";
	api_key = "da2-3dyeyddz6vhltdg7hpm3u2jxne";
}


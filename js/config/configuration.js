var api_url = "";
var api_ws = "";
var api_key = "";
var bucket = "";
var stage = ""

if (!localStorage["staging-environment"] || localStorage["staging-environment"] == "false"){
	console.log("Connected to production");
	stage = "production";
	bucket = "";
	localStorage["aws-congnito-user-pool-id"] = "eu-west-1_VCBsMeURY";
	localStorage["aws-congnito-app-id"] = "56hq9fjhgih0n079mf7ttbllke";
	localStorage["aws-congnito-ui"] = "https://tracepapertwee-production-8yokeu.auth.eu-west-1.amazoncognito.com";
	api_url = "https://5bxy2tiphvbixlx6so247igxw4.appsync-api.eu-west-1.amazonaws.com/graphql";
	api_ws = "wss://5bxy2tiphvbixlx6so247igxw4.appsync-realtime-api.eu-west-1.amazonaws.com/graphql";
	api_key = "da2-ll2qxpyshzcmveqg3nr62kl6hq";
}
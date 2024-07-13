if (localStorage["staging-environment"] && localStorage["staging-environment"] == "true"){
	console.log("Connected to staging");
	stage = "staging";
	bucket = "";
	localStorage["aws-congnito-user-pool-id"] = "eu-west-1_L7sG8p675";
	localStorage["aws-congnito-app-id"] = "17esv6bkechtre4uucdqhtopgv";
	localStorage["aws-congnito-ui"] = "";
	api_url = "https://iqnq2e7udfeobpc6tkwhxivacq.appsync-api.eu-west-1.amazonaws.com/graphql";
	api_ws = "wss://iqnq2e7udfeobpc6tkwhxivacq.appsync-realtime-api.eu-west-1.amazonaws.com/graphql";
	api_key = "da2-ghsgufjfprf2ncwkj2lrzfqbfq";
}
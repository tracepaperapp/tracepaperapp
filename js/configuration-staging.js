if (localStorage["staging-environment"] && localStorage["staging-environment"] == "true"){
	console.log("Connected to staging");
	stage = "staging";
	bucket = "";
	localStorage["aws-congnito-user-pool-id"] = "eu-west-1_bd6BdOASO";
	localStorage["aws-congnito-app-id"] = "16kfo6c02b0sifsuos2obcnslm";
	localStorage["aws-congnito-ui"] = "https://tracepapertwee-staging.auth.eu-west-1.amazoncognito.com";
	api_url = "https://vkgmx3ronvbxpln4joim26bsv4.appsync-api.eu-west-1.amazonaws.com/graphql";
	api_ws = "wss://vkgmx3ronvbxpln4joim26bsv4.appsync-realtime-api.eu-west-1.amazonaws.com/graphql";
	api_key = "da2-ehi36kttnzes5br5uelit2qh7y";
}

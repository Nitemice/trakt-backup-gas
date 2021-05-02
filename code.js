const baseUrl = "https://api.trakt.tv/";
const authUrl = baseUrl + "oauth/token";
const apiUrl = baseUrl + "users/me/";
const pathList = [
    "?extended=full", // profile info
    "collection/movies?extended=metadata",
    "collection/shows?extended=metadata",
    "comments/all?include_replies=true",
    "followers",
    "following",
    "friends",
    "history/episodes?limit=250",
    "history/movies?limit=250",
    "ratings/episodes",
    "ratings/movies",
    "ratings/seasons",
    "ratings/shows",
    "recommendations",
    "stats",
    "watched/movies",
    "watched/shows",
    "watchlist/episodes",
    "watchlist/movies",
    "watchlist/seasons",
    "watchlist/shows",
];


function getData(config, url)
{
    var headers = {
        "Authorization": "Bearer " + config.authToken,
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": config.clientId
    };

    var response = UrlFetchApp.fetch(url, {
        headers: headers
    });

    return response.getContentText();
}

function getFreshAuth()
{
    // Retrieve refreshable auth info from scratch
    // Using interactive "device" auth

    // Initial Request - get code for user to enter
    var options = {
        'method': 'post',
        'Content-Type': 'application/json',
        'payload': {
            "client_id": config.clientId,
        }
    };
    var response = UrlFetchApp.fetch(baseUrl + "/oauth/device/code", options);

    // Retrieve values from response
    var initResp = JSON.parse(response.getContentText());
    const deviceCode = initResp.device_code;
    const expiry = initResp.expires_in;
    const interval = initResp.interval;

    // Show the user where to go & what to enter
    Logger.log("Go to %s and enter: %s", initResp.verification_url,
        initResp.user_code);

    // Poll Request - check if the app is authorised yet
    var queryTime = 0;
    while (queryTime < expiry)
    {
        var payload = {
            "code": deviceCode,
            "client_id": config.clientId,
            "client_secret": config.clientSecret,
        };

        options = {
            'method': 'post',
            'Content-Type': 'application/json',
            'payload': payload,
            'muteHttpExceptions': true
        };

        response = UrlFetchApp.fetch(baseUrl + "/oauth/device/token", options);
        // Logger.log(response);

        // If the response was a success, we're authorised
        if (response.getResponseCode() == 200)
        {
            // Grab the values we're looking for and save
            var newTokens = JSON.parse(response.getContentText());
            var authProps = new Object();
            authProps.authToken = newTokens.access_token;
            authProps.refreshToken = newTokens.refresh_token;
            authProps.expiry = newTokens.created_at + newTokens.expires_in;
            return authProps;
        }
        // If the response is anything other than 'pending', something's wrong
        else if (response.getResponseCode() != 400)
        {
            throw "Something went wrong polling for authorisation.";
        }

        // Let them know we're still waiting
        Logger.log("Polling countdown: %s / %s ...", queryTime.toString(),
            expiry.toString());

        // Sleep until we can make another request
        Utilities.sleep(interval * 1000);
        queryTime += interval;
    }

}

function refreshAuth()
{
    // Retrieve refreshable auth info
    var userProperties = PropertiesService.getUserProperties();
    var authProps = userProperties.getProperties();

    // Check if refreshable auth info is there
    if (!authProps.hasOwnProperty("refreshToken") ||
        !authProps.hasOwnProperty("authToken"))
    {
        Logger.log("No access/refresh token. Need to authenticate.");
        authProps = getFreshAuth(config);
        // userProperties.setProperties(authProps);
    }

    // Check if the auth token has expired yet
    var now = Date.now() / 1000;
    if (now < authProps.expiry)
    {
        return;
    }

    var payload = {
        "refresh_token": authProps.refreshToken,
        "client_id": config.clientId,
        "client_secret": config.clientSecret,
        "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
        "grant_type": "refresh_token"
    };

    var options = {
        'method': 'post',
        'Content-Type': 'application/json',
        'payload': payload
    };
    var response = UrlFetchApp.fetch(authUrl, options);
    var newTokens = JSON.parse(response.getContentText());

    // Save new tokens
    authProps.authToken = newTokens.access_token;
    authProps.refreshToken = newTokens.refresh_token;
    authProps.expiry = newTokens.created_at + newTokens.expires_in;
    // Store in user properties
    userProperties.setProperties(authProps);

    // Create an object with just the details we need for retrieving data
    // TODO
    return authProps;
}

function backupCore()
{
    // Iterate over each of the paths to backup
    for (path of pathList)
    {
        var url = apiUrl + path;
        var data = getData(config, url);

        // Save the json file in the indicated Google Drive folder
        var filename = String(path).replace("\/", "_").split("?")[0];
        if (filename.length < 1)
        {
            filename = config.username;
        }
        filename += ".json";
        var file = common.findOrCreateFile(config.backupDir, filename, data);
        // Logger.log("X");
    }
}

function backupLists()
{
    // Make a folder for all list files
    var backupFolder = common.findOrCreateFolder(config.backupDir, "lists").getId();

    var baseUrl = apiUrl + "lists/";

    // Retrieve a list of all the lists
    var allLists = JSON.parse(getData(config, baseUrl));

    // Iterate through the lists and retrieve each one
    for (list of allLists)
    {
        // Retrieve list items
        var path = list.ids.slug;
        var url = baseUrl + path;
        var listItems = JSON.parse(getData(config, url + "/items"));
        var listComments = JSON.parse(getData(config, url + "/comments"));

        // Add list items & comments to other list data
        list.items = listItems;
        list.comments = listComments;

        // Save the json file in the indicated Google Drive folder
        var file = common.findOrCreateFile(backupFolder, path + ".json", JSON.stringify(list));
        // Logger.log("X");
    }
}

function main()
{
    // Refresh auth
    refreshAuth();

    // Iterate over each of the paths to backup
    backupCore();

    // Request all lists separately
    backupLists();
}
const baseUrl = "https://api.trakt.tv/";

// Data URLs
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

// Authentication URLs
const authUrl = baseUrl + "/oauth/device/code";
const pollUrl = baseUrl + "/oauth/device/token";
const refreshUrl = baseUrl + "/oauth/token";


function getData(authInfo, url)
{
    var headers = {
        "Authorization": "Bearer " + authInfo.accessToken,
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": authInfo.clientId
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
    var response = UrlFetchApp.fetch(authUrl, options);

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

        response = UrlFetchApp.fetch(pollUrl, options);
        // Logger.log(response);

        // If the response was a success, we're authorised
        if (response.getResponseCode() == 200)
        {
            // Grab the values we're looking for and return them
            var newTokens = JSON.parse(response.getContentText());
            var authInfo = new Object();

            authInfo.accessToken = newTokens.access_token;
            authInfo.refreshToken = newTokens.refresh_token;
            authInfo.expiry = newTokens.created_at + newTokens.expires_in;
            return authInfo;
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

    // Polling time expired without success
    // Can't do much without authentication
    throw "Polling expired without authorisation.";
}

function refreshAuth(refreshToken)
{
    // Refresh auth info with refresh token

    // Request refreshed tokens
    var payload = {
        "refresh_token": refreshToken,
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

    var response = UrlFetchApp.fetch(refreshUrl, options);

    // Grab the values we're looking for and return them
    var newTokens = JSON.parse(response.getContentText());
    var authInfo = new Object();

    authInfo.accessToken = newTokens.access_token;
    authInfo.refreshToken = newTokens.refresh_token;
    authInfo.expiry = newTokens.created_at + newTokens.expires_in;
    return authInfo;
}

function retrieveAuth()
{
    // Retrieve refreshable auth info from user properties store
    var userProperties = PropertiesService.getUserProperties();
    var authInfo = userProperties.getProperties();

    // Check if auth info is there
    if (!authInfo.hasOwnProperty("refreshToken") ||
        !authInfo.hasOwnProperty("accessToken"))
    {
        // Fall back to getting fresh auth
        Logger.log("No access/refresh token. Running first-run authentication.");
        authInfo = getFreshAuth(config);

        // Save the new auth info back to the user properties store
        userProperties.setProperties(authInfo);
    }

    // Check if the auth token has expired yet
    var now = Date.now() / 1000;
    if (now > authInfo.expiry)
    {
        // Refresh the auth info
        Logger.log("Access token expired. Refreshing authentication...");
        authInfo = refreshAuth(authInfo.refreshToken);

        // Save the new auth info back to the user properties store
        userProperties.setProperties(authInfo);
    }

    // Return an object with the details we need for retrieving data
    authInfo.clientId = config.clientId;
    return authInfo;
}

function backupCore()
{
    // Retrieve auth
    var authInfo = retrieveAuth();

    // Iterate over each of the paths to backup
    for (path of pathList)
    {
        // Logger.log(path);
        var url = apiUrl + path;
        var data = getData(authInfo, url);

        // Save the json file in the indicated Google Drive folder
        var filename = String(path).replace("\/", "_").split("?")[0];
        if (filename.length < 1)
        {
            filename = config.username;
        }
        filename += ".json";
        var file = common.updateOrCreateFile(config.backupDir, filename, data);
    }
}

function backupLists()
{
    // Retrieve auth
    var authInfo = retrieveAuth();

    // Make a folder for all list files
    var backupFolder = common.findOrCreateFolder(config.backupDir, "lists").getId();

    var baseUrl = apiUrl + "lists/";

    // Retrieve a list of all the lists
    var allLists = JSON.parse(getData(authInfo, baseUrl));
    var listList = [];

    // Iterate through the lists and retrieve each one
    for (list of allLists)
    {
        // Retrieve list items
        var path = list.ids.slug;
        // Logger.log(path);
        var url = baseUrl + path;
        var listItems = JSON.parse(getData(authInfo, url + "/items"));
        var listComments = JSON.parse(getData(authInfo, url + "/comments"));

        // Add list items & comments to other list data
        list.items = listItems;
        list.comments = listComments;

        // Save the json file in the indicated Google Drive folder
        var output = JSON.stringify(list, null, 4);
        var filename = path + ".json";
        var file = common.updateOrCreateFile(backupFolder, filename, output);
        listList.push(filename);
    }

    if (config.removeMissingLists)
    {
        // Retrieve files from folder
        var fileIter = DriveApp.getFolderById(backupFolder).getFiles();
        while (fileIter.hasNext())
        {
            var file = fileIter.next();
            // If this file isn't in the list of lists,
            if (!listList.includes(file.getName()))
            {
                // Move it to the trash
                file.setTrashed(true);
            }
        }
    }
}

function main()
{
    // Iterate over each of the paths to backup
    backupCore();

    // Request all lists separately
    backupLists();
}
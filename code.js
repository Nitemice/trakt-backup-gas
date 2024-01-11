const baseUrl = "https://api.trakt.tv/";

// Data URLs
const apiUrl = baseUrl + "users/me/";
const pathList = [
    "?extended=full", // profile info
    "collection/movies?extended=metadata",
    "collection/shows?extended=metadata",
    "followers",
    "following",
    "friends",
    "history/episodes?limit=250",
    "history/movies?limit=250",
    "stats",
    "watched/movies",
    "watched/shows",
];
const paginatedPathList = [
    "comments/all?include_replies=true&limit=250",
    "likes/comments?limit=250",
    "favorites/movies?limit=250",
    "favorites/shows?limit=250",
    "ratings/episodes?limit=250",
    "ratings/movies?limit=250",
    "ratings/seasons?limit=250",
    "ratings/shows?limit=250",
    "watchlist/episodes?limit=250",
    "watchlist/movies?limit=250",
    "watchlist/seasons?limit=250",
    "watchlist/shows?limit=250",
];

// Authentication URLs
const authUrl = baseUrl + "/oauth/device/code";
const pollUrl = baseUrl + "/oauth/device/token";
const refreshUrl = baseUrl + "/oauth/token";


function getData(authInfo, url, getAllPages = false)
{
    var options = {
        "headers":
        {
            "Authorization": "Bearer " + authInfo.accessToken,
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": authInfo.clientId
        },
        "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(url, options);
    var headers = response.getHeaders();
    var data = response.getContentText();

    // Bail out if we only wanted the first page, or
    // this data isn't paginated, or there's only one page to get
    if (!getAllPages || !headers.hasOwnProperty("x-pagination-page-count") ||
        headers["x-pagination-page-count"] == 1)
    {
        return data;
    }

    // Retrieve page count
    var totalPages = headers["x-pagination-page-count"];

    data = JSON.parse(data);
    for (let page = 2; page <= totalPages; page++)
    {
        var pageUrl = url + `&page=${page}`;
        response = UrlFetchApp.fetch(pageUrl, options);
        var newData = JSON.parse(response.getContentText());
        data = data.concat(newData);
    }

    return JSON.stringify(data);
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

function resetAuth()
{
    // Wipe refreshable auth info from user properties store
    var userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty("refreshToken").deleteProperty("accessToken");

    // Get fresh auth
    Logger.log("Access/refresh token deleted. Running first-run authentication again.");
    var authInfo = getFreshAuth(config);

    // Save the new auth info back to the user properties store
    userProperties.setProperties(authInfo);
}

function getFilename(path)
{
    // Sanitise path to use as filename
    var filename = String(path).replace("\/", "_").split("?")[0];
    if (filename.length < 1)
    {
        filename = config.username;
    }
    filename += ".json";
    return filename;
}

function doListsBackup(lists, authInfo, baseUrl, backupFolder)
{
    var listList = [];

    // Iterate through the lists and retrieve each one
    for (let list of lists)
    {
        // Retrieve list items
        let path = list.ids.trakt;
        // Logger.log(path);
        let url = baseUrl + path;

        // Add list items & comments to other list data, if we can get it.
        // There's some weird stuff going on here because some lists just
        // refuse to return items/comments, e.g. lists get privated
        if (list.item_count > 0)
        {
            let listItems = getData(authInfo, url + "/items?limit=50", true);
            try
            {
                listItems = JSON.parse(listItems)
            }
            catch { }
            list.items = listItems;
        }
        if (list.comment_count > 0)
        {
            let listComments = JSON.parse(
                getData(authInfo, url + "/comments?limit=50", true));
            list.comments = listComments;
        }

        // Save the json file in the indicated Google Drive folder
        let output = JSON.stringify(list, null, 4);
        let filename = list.ids.slug + ".json";
        let file = common.updateOrCreateFile(backupFolder, filename, output);
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

function backupCore()
{
    // Retrieve auth
    var authInfo = retrieveAuth();

    // Iterate over each of the paths to backup
    for (const path of pathList)
    {
        // Logger.log(path);
        var url = apiUrl + path;
        var data = getData(authInfo, url, false);

        var filename = getFilename(path);
        var file = common.updateOrCreateFile(config.backupDir, filename, data);

    }

    // Iterate over each of the paginated paths to backup
    for (const path of paginatedPathList)
    {
        // Logger.log(path);
        var url = apiUrl + path;
        var data = getData(authInfo, url, true);

        var filename = getFilename(path);
        var file = common.updateOrCreateFile(config.backupDir, filename, data);
    }
}

function backupLists()
{
    // Retrieve auth
    var authInfo = retrieveAuth();

    // Backup our lists into a folder
    var backupFolder = common.findOrCreateFolder(config.backupDir, "lists").getId();
    var listsBaseUrl = apiUrl + "lists/";
    // Retrieve a list of all the lists
    var lists = JSON.parse(getData(authInfo, listsBaseUrl));
    doListsBackup(lists, authInfo, listsBaseUrl, backupFolder);

    // Backup our liked lists into a folder
    backupFolder = common.findOrCreateFolder(config.backupDir, "liked_lists").getId();
    // Retrieve a list of all the lists
    lists = JSON.parse(getData(authInfo, apiUrl + "likes/lists?limit=250", true));
    lists = lists.map((x) => x.list);
    listsBaseUrl = baseUrl + "lists/";
    doListsBackup(lists, authInfo, listsBaseUrl, backupFolder);
}

function main()
{
    // Iterate over each of the paths to backup
    backupCore();

    // Request all lists separately
    backupLists();
}
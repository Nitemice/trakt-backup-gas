const authUrl = "https://api.trakt.tv/oauth/token";
const apiUrl = "https://api.trakt.tv/users/me/";
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

function refreshAuth(config)
{
    // Check if the auth token has expired yet
    var now = Date.now() / 1000;
    if (now < config.expiry)
    {
        return;
    }

    var payload = {
        "refresh_token": config.refreshToken,
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
    config.authToken = newTokens.access_token;
    config.refreshToken = newTokens.refresh_token;
    config.expiry = newTokens.created_at + newTokens.expires_in;
    // Store in JSON config
    common.saveJson(configId, config);
}

function backupCore(config)
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

function backupLists(config)
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
    // Retrieve config file
    var config = common.grabJson(configId);

    // Refresh auth
    refreshAuth(config);

    // Iterate over each of the paths to backup
    backupCore(config);

    // Request all lists separately
    backupLists(config);
}
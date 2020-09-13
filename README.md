# SplatNet Desktop
Unofficial Desktop Client for Splatoon 2's SplatNet.

### Installing
Currently Windows (exe) and OS X (dmg) are supported. Get the packages here https://github.com/mathewthe2/splatnet-desktop/releases

### Preview
<img width="804" alt="Screen Shot 2020-09-12 at 10 21 17 PM" src="https://user-images.githubusercontent.com/13146030/92998860-6e514080-f557-11ea-8e10-1c43e5dc71ad.png">'

### How it Works
- **Session Token Code**: The app generates a Nitnendo login url and after the user logins it redirects to a link containing the Session Token Code.
- **Session Token**: The app sends a request to Nintendo with the Session Token Code to get the Session Token 
- **Iksm token**: The app sends a request to flapg server with the Session Token to get the f flag required for Nintendo's Web Service endpoint. This returns the Iksm token. The Iksm token is placed in BrowserWindow cookies and is the only value required to access SplatNet.
- Once we have the Session Token, we can refresh the Iksm token without further logins.

### Privacy Statement
I am not affiliated with Nintendo in any way, and I have no aceess to nor do I save any usernames, passwords, or web tokens.

### Acknowledgements
[hymm](https://github.com/hymm): borrowed the code for HTTP Protocol Registration and Cookie Jar from his [Squid Tracks Application](https://github.com/hymm/squid-tracks/) and helped him fix the login for Squid Tracks.

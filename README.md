# NoScaffold
The web server that, when serving content, just suggests a UX presentation, but ultimately lets the consumers decide.

_Status_: Functional proof-of-concept

## Why?
The way we think of web applications is usually of a server that serves content and presentation to users,
 that are then tied to the UX decisions that have been made by the developer. (And often, as a user, that's.... _frustrating_...).

Conjunctionally, in the world of BFFs and OpenData, we have more and more APIs at hand, and content becomes more important than UI.

Also, the content we serve is often of the form of a feed, with minimal client-side interactions needed.
Often, it's a snippet of data, that we can skip to go to the next, retaining the same widget-like presentation.

So what if we did an _IoC_ of the presentation when serving web content?
What if the server just gave a suggestion of presentation initially, like the one on your cornflakes box,
 but ultimately lets you decide which information is key for you, and which can be omitted?
Then, what if it remembered what you decided, to always serve you the content in the form that you prefer?

## How?
We're lucky, as developers, to have great libraries like `d3.js` to help us format content on-the-fly,
 based on functional transformations.
This is usually done for data visualisation, ending up as an SVG representation.

But we can also use the same goodness to format HTML nodes, and effectively provide a UX for a feed of content.

And this is what NoScaffold is:
* The server sends a `JSON` API url, along with a `pug` HTML-like template, a snippet of `CSS`, and a `JSON` schema definition.
* Then the client queries the API to get the next `JSON` content, uses `d3.js` to format the corresponding widget,
 as per the `pug` template definition and the `CSS` snippet, filling the dynamic content thanks to the `JSON` schema definition.
* then the users can decide to modify the `pug` template definition, the `CSS` snippet and the `JSON` schema definition,
 to format the content as they prefer.
* Those preferences are stored in the client's local storage, so that whenever they come back,
  they have the same resulting UI.
* then the users can crawl the feed of content, by moving the previous/next item, still ending up with the UI presentation that they prefer.

![](https://raw.githubusercontent.com/MisterK/noScaffold/master/NoScaffold.png)

### When could it be useful?
For all contents feeds, like:
* search results lists,
* social media content feeds,
* RSS/Atom feeds,
* API discovery,
* Rapid UI prototyping on top of an existing API.

### When is it useless?
For all client-side interactions-heavy interfaces, like:
* forms,
* wizards,
* games,
* data visualisations,
* maps,
* static content pages.

## Tech stack
NoScaffold is a `Node.js` webapp.

On the server-side, it's using:
* `Node.js` for the core,
* `express` for the web server,
* `socket.io` for the server-client communication,
* `request-promise` for external HTTP calls,
* `pug` (formerly known as `jade`) for the templating.

On the client-side, it's using:
* `d3.js` for the UX rendering,
* `lawnchair.js` for the client-side local storage,
* `socket.io` for the server-client communication,
* `angular 1` for the business logic and the wiring,
* `loDash` for the FP goodness.

## What's next?
* Finish the full support of the `pug` template definitions.
* Find a way to allow a minimal safe way to add client-side interactions with the UI. (d3 event callbacks definitions?).
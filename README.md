# fiskeapp

En minimal Docker-container som serverar en "Hello World"-sida över HTTP (nginx på port 80) – startpunkt för en fiske-app.

```sh
docker build -t fiskeapp .
docker run --rm -p 8080:80 fiskeapp
```

Öppna sedan http://localhost:8080.

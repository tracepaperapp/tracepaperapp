import os
import json

# Verzamel alle HTML-bestanden in de 'components'-map
components_folders = ["assets", "auth", "configuration", "css", "js", "components"]
files_to_cache = ["/","/index.html","/favicon.ico"]


def fetch_files(folder):
    for root, dirs, files in os.walk(folder):
        for file in files:
            if file.endswith(".html") or file.endswith(".js") or file.endswith(".png") or file.endswith(".css"):
                # Voeg het bestandspad toe in het gewenste format: /components/...
                relative_path = os.path.join(root, file).replace("\\", "/")
                files_to_cache.append(f"/{relative_path}")


for folder in components_folders:
    fetch_files(folder)

# Lees de bestaande inhoud van de 'service-worker.js'
with open("service-worker.js", "r") as f:
    script = "const urlsToCache = "
    script += json.dumps(files_to_cache, indent=2)
    script += ";\n\n//generator-devider//"
    script += f.read().split("//generator-devider//")[1]

with open("service-worker.js", "w") as f:
    f.write(script)

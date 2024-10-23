import os
import requests
import time
import logging

# Stel logging in
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# Start tijd van het volledige script
script_start_time = time.time()

# Verkrijg de directory waarin het script zelf zich bevindt
script_dir = os.path.dirname(os.path.abspath(__file__))

# Itereer door alle bestanden in de directory
for script in os.listdir(script_dir):
    # Filter alleen de .js- en .css-bestanden
    if not (script.endswith(".js") or script.endswith(".css")):
        continue

    # Maak het volledige pad naar het bestand
    script_path = os.path.join(script_dir, script)

    # Lees het bestand en pak de eerste regel
    with open(script_path, "r") as f:
        first_line = f.readlines()[0].strip()

    # Controleer of de eerste regel een URL bevat (in commentaarvorm)
    if script.endswith(".js"):
        if not first_line.startswith("//"):
            continue
        # Verwijder de eerste "//"
        instruction = first_line.replace("//", "", 1).strip()

    elif script.endswith(".css"):
        if not first_line.startswith("/*") or not first_line.endswith("*/"):
            continue
        # Verwijder de /* en */
        instruction = first_line.replace("/*", "", 1).replace("*/", "").strip()

    # Log de URL die wordt gedownload
    logging.info(f"Downloading from URL: {instruction}")

    # Meet de tijd van de download
    download_start_time = time.time()
    try:
        response = requests.get(instruction)
        response.raise_for_status()  # Controleer of het verzoek succesvol was
        content = response.text  # De inhoud van de pagina als string

        # Schrijf de inhoud opnieuw naar het bestand, inclusief de URL als commentaar
        with open(script_path, "w") as f:
            if script.endswith(".js"):
                f.write(f"// {instruction}\n")
            elif script.endswith(".css"):
                f.write(f"/* {instruction} */\n")
            f.write(content)

        download_duration = time.time() - download_start_time
        logging.info(f"Download complete for {script_path} in {download_duration:.2f} seconds")

    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to download from {instruction}: {e}")

# Meet de totale duur van het script
total_duration = time.time() - script_start_time
logging.info(f"Script completed in {total_duration:.2f} seconds")
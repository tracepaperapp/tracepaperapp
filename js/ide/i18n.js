

var i18n_data = await fetch('/assets/language.properties');
i18n_data = await i18n_data.text();

i18n_data.split("\n").filter(x => x != "").forEach(x => {
    var element = x.split("=");
    label[element[0]] = element[1];
});
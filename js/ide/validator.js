
async function validate_and_repair_model(){
    let files = await FileSystem.listFiles();

    // Initialize config
    if (!files.includes("config.xml")){
        await FileSystem.write("config.xml", initial_config.replace("#name#",localStorage.project_name));
    }

    // Initialize meta data store
    if (!files.includes("meta.json")){
        await FileSystem.write("meta.json", JSON.stringify({roles:["administrator"]},null,2));
    }

    // Initialize setup environment
    if (!files.includes("notifiers/SetupEnvironment.xml")){
        await FileSystem.write("notifiers/SetupEnvironment.xml", setup_environment);
        await FileSystem.write("notifiers/SetupEnvironment.md", setup_environment_docs);
    }

    for (let i = 0; i < files.length; i++){
        let file = files[i];
        if (file.startsWith("commands/") && file.endsWith(".xml")){
            let command = await Modeler.get(file,true);
            if (command.att_type != "ActorEvent"){
                command.att_type = "ActorEvent";
                await Modeler.save_model(file,{event:command});
            }
        }
        if (file.startsWith("domain/") && file.includes("/events/") &&file.endsWith(".xml")){
            let event = await Modeler.get(file,true);
            if (event.att_type != "DomainEvent"){
                event.att_type = "DomainEvent";
                await Modeler.save_model(file,{event:event});
            }
        }
        if (file.startsWith("domain/") && file.includes("/entities/") && file.endsWith(".xml")){
            let entity = await Modeler.get(file,true);
            let array = deduplicate_on_attribute(entity.field,"att_name");
            if (array.length < entity.field.length){
                entity.field = array;
                await Modeler.save_model(file,{"nested-object":entity});
            }
        }
        //TODO Validations
    }
}

let initial_config = `<draftsman project-name="#name#" xmlns="https://tracepaper.draftsman.io">
    <functional-scenarios clean-db="true" clean-iam="true" minimum-event-coverage="80" minimum-view-coverage="80"></functional-scenarios>
    <events>
      <event name="FileUploaded" type="DomainEvent" source="appsync">
        <field name="bucket" type="String"></field>
        <field name="uri" type="String"></field>
        <field name="location" type="String"></field>
        <field name="username" type="String"></field>
      </event>
    </events>
</draftsman>`;

let setup_environment = `
<notifier name="SetupEnvironment">
  <trigger source="@afterDeployment">
    <mapping target="dummy" value="#&apos;&apos;"></mapping>
  </trigger>
  <activity type="iam-create-systemuser" fail-silent="true" id="vMB9LZ"></activity>
  <activity id="vkYuPh" type="create-iam-group" group-name="#&apos;expresion&apos;"></activity>
  <activity id="wjJU3t" group-name="#&apos;administrator&apos;" type="add-user-to-iam-group" username="#&apos;expresion&apos;"></activity>
</notifier>`;

let setup_environment_docs = `
# Setup Environment

This automation makes sure that the environment is ready for processing.
It makes sure that the system user is present and that the *administrator* role is created.
`;
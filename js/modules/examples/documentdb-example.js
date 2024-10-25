document.addEventListener('alpine:init', () => {
    Alpine.data('taskModule', function(){
        return {
            taskTitle: this.$persist(""),
            openTasks: [],
            completedTasks: [],
            async init(){
                this.collection = await Database.open("tasks");
                await this.fetch_data();
            },
            async add_task(){
                await this.collection.add({
                    title: this.taskTitle,
                    completed: false
                });
                this.taskTitle = "";
                await this.fetch_data();
            },
            async fetch_data(){
                let records = await this.collection.getAll();
                this.openTasks = records.filter(x => !x.completed);
                this.completedTasks = records.filter(x => x.completed);
            },
            async complete_task(){
                await Promise.all(this.openTasks.filter(x => x.completed).map(x => this.collection.update(x.id,{completed: x.completed})));
                await this.fetch_data();
            },
            async reactivate_task(){
                await Promise.all(this.completedTasks.filter(x => !x.completed).map(x => this.collection.update(x.id,{completed: x.completed})));
                await this.fetch_data();
            },
            async delete_task(){
                await Promise.all(this.completedTasks.filter(x => x.deleted).map(x => this.collection.remove(key=x.id)));
                await this.fetch_data();
            },
            async update_task(){
                let records = await this.collection.getAll();
                await Promise.all(
                    this.openTasks.filter(
                        x => x.title != records.filter(y => x.id == y.id).at(0).title
                    ).map(x => this.collection.update(x.id,{title: x.title})));
                await this.fetch_data();
                this.$el.blur();
            }
        }
    });
})
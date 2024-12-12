import cron, { schedule } from "node-cron";
import { Telegraf } from "telegraf";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const { TOKEN, ID, APP_NAME, EMAIL } = process.env;
// TODO: handle multiple pages (though i don't think it's necessary here)
const url = "https://api.hh.ru/vacancies?employer_id=2348579&per_page=100";
const crone = "0-59/5 * * * *";
const file = join(import.meta.dirname, "data.json");

const ids = {
    "877100": "Летово",
    "7012892": "Летово Джуниор"
};
const addr = str => {
    return ids[str] || "Неизвестно";
}
/** @param {Salary} sal */
const salary = sal => {
    return sal ? `от ${sal.from || "Неизвестно"} до ${sal.to || "Неизвестно"} ${sal.currency || "?"}` : "Неизвестно";
}

const bot = new Telegraf(TOKEN);

/** @typedef {{ raw: string, id: string }} Address */
/** @typedef {{ requirement: string, responsibility: string }} Snippet */
/** @typedef {{ name: string }} Schedule */
/** @typedef {{ name: string }} Experience */
/** @typedef {{ name: string }} Employment */
/** @typedef {{ from: number | null, to: number | null, currency: string }} Salary */
/** @typedef {{ id: string, name: string, address: Address, salary: null | Salary, snippet: Snippet, schedule: Schedule, experience: Experience, employment: Employment }} Vacancy */
/** @typedef {{ items: Vacancy[] }} Resp */

/**
 * removes the unnecessary fields from a vacancy
 * 
 * @param {Vacancy} raw the full vacancy
 * @returns {Vacancy} the minimized vacancy
 */
const construct = raw => {
    return {
        "id": raw.id,
        "name": raw.name,
        "address": raw.address,
        "salary": raw.salary,
        "snippet": raw.snippet,
        "schedule": raw.schedule,
        "experience": raw.experience,
        "employment": raw.employment
    };
}

const delay = time => new Promise(resolve => setTimeout(resolve, time));

cron.schedule(crone, async () => {
    const f = await fetch(url, {
        "headers": {
            "User-Agent": `${APP_NAME}/1.0 (${EMAIL})`
        }
    });
    /** @type {Resp} */
    const j = await f.json();
    /** @type {Record<string, Vacancy>} */
    let data = {};
    if(!existsSync(file))
        writeFileSync(file, JSON.stringify(data));
    else
        data = JSON.parse(readFileSync(file, "utf-8"));
    for(let vacancy of j.items) {
        vacancy = construct(vacancy);
        if(vacancy.id in data) {
            if(JSON.stringify(data[vacancy.id]) != JSON.stringify(vacancy)) {
                let msg = `🟨 Изменено #v${vacancy.id}:\n`;
                const old = data[vacancy.id];
                if(old.name != vacancy.name)
                    msg += `\nНазвание: ${old.name} -> ${vacancy.name}`;
                if(old.address.raw != vacancy.address.raw)
                    msg += `\nАдрес: ${old.address ? `${old.address.raw} (${addr(old.address.id)})` : "Неизвестно"} -> ${vacancy.address ? `${vacancy.address.raw} (${addr(vacancy.address.id)})` : "Неизвестно"}`;
                if(old.schedule.name != vacancy.schedule.name)
                    msg += `\nРасписание: ${old.schedule ? old.schedule.name : "Неизвестно"} -> ${vacancy.schedule ? vacancy.schedule.name : "Неизвестно"}`;
                if(old.experience.name != vacancy.experience.name)
                    msg += `\nОпыт: ${old.experience ? old.experience.name : "Неизвестно"} -> ${vacancy.experience ? vacancy.experience.name : "Неизвестно"}`;
                if(old.employment.name != vacancy.employment.name)
                    msg += `\nТрудоустройство: ${old.employment ? old.employment.name : "Неизвестно"} -> ${vacancy.employment ? vacancy.employment.name : "Неизвестно"}`;
                if(JSON.stringify(old.salary) != JSON.stringify(vacancy.salary))
                    msg += `\nЗарплата: ${salary(old.salary)} -> ${salary(vacancy.salary)}`;
                if(JSON.stringify(old.snippet) != JSON.stringify(vacancy.snippet))
                    msg += `\nОписание: Требования = \"${old.snippet.requirement}\", ответственность = \"${old.snippet.responsibility}\" -> Требования = \"${vacancy.snippet.requirement}\", ответственность = \"${vacancy.snippet.responsibility}\"`;
                msg += `\n\nhttps://hh.ru/vacancy/${vacancy.id}`;
                await bot.telegram.sendMessage(ID, msg);
                data[vacancy.id] = vacancy;
            }
        } else {
            data[vacancy.id] = vacancy;
            const msg = `🟩 Добавлено #v${vacancy.id}
Название: ${vacancy.name}
Адрес: ${vacancy.address ? `${vacancy.address.raw} (${addr(vacancy.address.id)})` : "Неизвестно"}
Расписание: ${vacancy.schedule ? vacancy.schedule.name : "Неизвестно"}
Опыт: ${vacancy.experience ? vacancy.experience.name : "Неизвестно"}
Трудоустройство: ${vacancy.employment ? vacancy.employment.name : "Неизвестно"}
Зарплата: ${salary(vacancy.salary)}
Описание: Требования = \"${vacancy.snippet.requirement}\", ответственность = \"${vacancy.snippet.responsibility}\"

https://hh.ru/vacancy/${vacancy.id}`;
            await bot.telegram.sendMessage(ID, msg);
            await delay(100); // to avoid errors
        }
    }
    for(const vacancyID in data)
        if(!j.items.find(x => x.id == vacancyID)) {
            const msg = `🟥 Удалено #v${vacancyID}`;
            await bot.telegram.sendMessage(ID, msg);
            delete data[vacancyID];
        }
    writeFileSync(file, JSON.stringify(data));
});
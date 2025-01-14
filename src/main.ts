import russianDate from './util/russianDate';
import { operationType } from './entity/Operation';

import {data} from '../data/2024'
import {requiredPayment} from '../data/2024'

const currentYear:string = '2024'

function quarter(stringDate:string):number{
    if (Date.parse(stringDate)>=Date.parse(russianDate('01.10.'+currentYear))){return 3}
    if (Date.parse(stringDate)>=Date.parse(russianDate('01.07.'+currentYear))){return 2}
    if (Date.parse(stringDate)>=Date.parse(russianDate('01.04.'+currentYear))){return 1}
    return 0
}

function printQuater(quarter:number){
    console.log(`\n${quarter+1}кв: \nДоход: ${income[quarter]}, \nНачислено: ${income[quarter]*0.06},`)
    console.log(`Уплачено : ${social[quarter]}, \nОсталось : ${income[quarter]*0.06-social[quarter]}`)
}

function printTaxes(){
    console.log('\nНалоговые платежи')
    for (let index = 0; index < data.length; index++) {
        const element = data[index];
        if (element._type == operationType.Tax){
            console.log(`${element._date.substring(0,10)} ${element._amount}`)
        }
    }    
}

function printSummary(){
    console.log('\nНакопительный итог:')
    for (let index = 0; index <= 3; index++) {
        console.log(`${index+1}кв: Доход :${incomeTotal[index]} Оплачено: ${socialTotal[index]}`)
    }    
}

function printRequiredRemainder(){  
    console.log(`\nОбязательные платежи: ${requiredPayment} + ${(incomeTotal[3]-300000)/100}`)
    console.log(`Уплачено: ${socialTotal[3]}, Остаток:  ${requiredPayment+(incomeTotal[3]-300000)/100-socialTotal[3]}`)
}

type quarterReport = [number,number,number,number];
let income: quarterReport = [0,0,0,0];
let incomeTotal: quarterReport = [0,0,0,0];
let social: quarterReport = [0,0,0,0];
let socialTotal: quarterReport = [0,0,0,0];

for (let index = 0; index < data.length; index++) {
    const element = data[index];
    
    if (element._type == operationType.Income){
            income[quarter(element._date)]+=element._amount
            for (let i = 3; i>= quarter(element._date); i--) {
                incomeTotal[i]+=element._amount;
            }
    }

    if (element._type == operationType.Social){
        social[quarter(element._date)]+=element._amount
        for (let i = 3; i>= quarter(element._date); i--) {
            socialTotal[i]+=element._amount;
        }
    }
}

for (let index = 0; index <= 3; index++) {
    printQuater(index);
}

printRequiredRemainder();
printTaxes();
printSummary();
console.log('\n')
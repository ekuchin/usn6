
import {Operation} from './entity/Operation'
import { operationType } from './entity/Operation'
import russianDate from './util/russianDate'

// Здесь указать правильное имя файла
import data from '../preConverted'

/*
Элементы массива
1 - дата
3 - инн
8 - расход
9 - доход
*/

const innIgnore = ['7734202860', '666201348146']
const innTax = ['7727406020']

let result = []

for (let i = 0; i < data.length; i++) {
    const element = data[i];

    if (innIgnore.indexOf(element[3].toString())!=-1){continue} // Ignore payments to/from ignore list

    let payment = new Operation(operationType.Income, russianDate(element[1].toString()), element[9])

    if (innTax.indexOf(element[3].toString())!=-1){ // Tax/Social payment
        
        const isSocial = element[10].toString().startsWith('ПФР');
        payment.type = isSocial ? operationType.Social : operationType.Tax,
        payment.amount = Number(element[8])
    }

    result.push(payment)
}
console.log(JSON.stringify(result))
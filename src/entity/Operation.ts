export enum operationType {Income, Tax, Social}

export class Operation{
    constructor(
        private _type:operationType,
        private _date:string,
        private _amount:number) {
        }

        get type():operationType {return this._type}
        set type(type:operationType){this._type = type}
        
        get date():string {return this._date}
        set date(date:string){this._date = date}

        get amount():number {return this._amount}
        set amount(amount:number){this._amount = amount}

}
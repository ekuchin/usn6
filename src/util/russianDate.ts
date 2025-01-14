export default function russianDate(dateString:string):string{
    let dateArray:string[] = dateString.split('.')
    let result = new Date()
    result.setFullYear(Number(dateArray[2]))
    result.setMonth(Number(dateArray[1])-1)
    result.setDate(Number(dateArray[0]))
    result.setUTCHours(0)
    result.setUTCMinutes(0)
    result.setUTCSeconds(0)
    result.setUTCMilliseconds(0)
    return result.toISOString()
}
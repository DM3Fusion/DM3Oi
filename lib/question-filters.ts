type SearchableQuestion={question_text:string;description:string;response_type:string;options:{option_label:string}[]};
export const normalizeQuestionQuery=(value?:string)=>(value??"").trim().slice(0,200);
export function questionMatchesSearch(question:SearchableQuestion,query:string){const term=normalizeQuestionQuery(query).toLowerCase();if(!term)return true;return [question.question_text,question.description,question.response_type.replaceAll("_"," "),...question.options.map(option=>option.option_label)].some(value=>value.toLowerCase().includes(term));}

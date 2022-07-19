export function plural(count: number, singular: string, plural: string) {
	return `${count === 1 ? singular : plural}`;
}

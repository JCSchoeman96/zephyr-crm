export type BrandMode = 'default' | 'alternate';

export interface BrandConfiguration {
	mode: BrandMode;
	name: string;
}

export const defaultBrand: BrandConfiguration = {
	mode: 'default',
	name: 'Zephyr CRM'
};

export const alternateBrand: BrandConfiguration = {
	mode: 'alternate',
	name: 'Zephyr CRM'
};

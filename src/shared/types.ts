export type TableInfo = {
  // table name
  name: string;
  // table type, copied from TableConfig.type
  type: string;
  // earliest replay timestamp available
  startTime: Date;
  // latest replay timestamp available, optional to enable lazy loading for file based data sources
  endTime?: Date;
};

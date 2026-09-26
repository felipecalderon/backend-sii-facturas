export const styles = {
  page: {
    size: 'LETTER',
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 30,
    paddingRight: 30,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1F2937',
    backgroundColor: '#FFFFFF'
  },
  // Cabecera superior
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  issuerCol: {
    width: '58%',
    paddingRight: 10
  },
  issuerName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  issuerGiro: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 2
  },
  issuerText: {
    fontSize: 7.5,
    color: '#4B5563',
    marginBottom: 1.5
  },
  // Caja Fiscal Roja (SII)
  siiBox: {
    width: '40%',
    borderWidth: 2,
    borderColor: '#C53030',
    borderRadius: 2,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 6,
    paddingRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF'
  },
  siiRut: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#C53030',
    marginBottom: 3
  },
  siiTipoDoc: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#C53030',
    textAlign: 'center',
    marginBottom: 4
  },
  siiFolio: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#C53030',
    marginBottom: 3
  },
  siiUnidadText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#C53030',
    textAlign: 'center'
  },
  // Sección Receptor
  receiverBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 3,
    padding: 8,
    backgroundColor: '#F9FAFB',
    marginBottom: 12
  },
  dataRow: {
    display: 'flex',
    flexDirection: 'row',
    marginBottom: 3
  },
  label: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#374151',
    marginRight: 4
  },
  value: {
    fontSize: 7.5,
    color: '#111827'
  },
  colHalf: {
    width: '50%',
    display: 'flex',
    flexDirection: 'row'
  },
  colFull: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row'
  },
  // Tabla de ítems
  tableHeader: {
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D1D5DB',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#374151'
  },
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 7.5
  },
  colItemNum: { width: '5%', textAlign: 'center' },
  colItemDesc: { width: '47%', paddingRight: 4 },
  colItemQty: { width: '12%', textAlign: 'right' },
  colItemPrice: { width: '18%', textAlign: 'right' },
  colItemTotal: { width: '18%', textAlign: 'right' },
  // Pie de página: Timbre y Totales
  footerRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 14
  },
  timbreCol: {
    width: '55%',
    alignItems: 'center',
    paddingRight: 10
  },
  barcodeImg: {
    width: 230,
    height: 80,
    objectFit: 'contain'
  },
  timbreTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 3,
    color: '#111827'
  },
  timbreSub: {
    fontSize: 6.5,
    textAlign: 'center',
    color: '#4B5563',
    marginTop: 1
  },
  totalsCol: {
    width: '42%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 3,
    padding: 8,
    backgroundColor: '#F9FAFB'
  },
  totalRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingBottom: 2
  },
  totalGrandRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    borderColor: '#111827',
    paddingTop: 4,
    marginTop: 3
  },
  totalGrandText: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#111827'
  },
  // Ley 19.983 Acuse de recibo
  cedibleBox: {
    marginTop: 14,
    borderWidth: 0.8,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    padding: 6,
    borderRadius: 2
  },
  cedibleTitle: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#4B5563',
    marginBottom: 3
  },
  cedibleFields: {
    fontSize: 6.5,
    color: '#6B7280',
    marginBottom: 2
  },
  cedibleLegend: {
    fontSize: 5.5,
    color: '#9CA3AF',
    textAlign: 'justify'
  }
};

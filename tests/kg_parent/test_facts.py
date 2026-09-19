import unittest
from scripts.kg_parent.facts import certificate,source_fact,amount

def text(price='100.00',periods=11,total='1100.00',name='甲幼稚園',address='香港某街1號'):
 return f'''Name of School {name}\nAddress of School {address}\nCourse / Class\nFEES AFTER DEDUCTION OF GOVERNMENT SUBSIDY\nNURSERY WHOLE-DAY\n {price} - {periods}/- {total}\nWith effect from : 01.09.2026\n'''
class Fees(unittest.TestCase):
 def test_exact_instalments(self):
  r=certificate(text(),'甲幼稚園','香港某街1號');self.assertEqual(r['rows'][0]['annual_cents'],110000);self.assertEqual(r['rows'][0]['periods'],11)
 def test_zero_not_unknown(self):self.assertEqual(certificate(text('免費 FREE',11,'免費 FREE'),'甲幼稚園','香港某街1號')['rows'][0]['annual_cents'],0)
 def test_cannot_borrow_other_campus(self):self.assertEqual(certificate(text(),'甲幼稚園','香港某街2號')['status'],'IDENTITY_REVIEW')
 def test_name_not_enough(self):self.assertEqual(certificate(text(),'乙幼稚園','香港某街1號')['status'],'IDENTITY_REVIEW')
 def test_arithmetic_fail_closed(self):self.assertEqual(certificate(text(total='1200.00'),'甲幼稚園','香港某街1號')['status'],'ARITHMETIC_REVIEW')
 def test_unknown_layout(self):self.assertEqual(certificate(text().replace('FEES AFTER DEDUCTION OF GOVERNMENT','FEES BEFORE DEDUCTION'),'甲幼稚園','香港某街1號')['status'],'LAYOUT_REVIEW')
 def test_multiple_dates_not_latest_guessed(self):self.assertEqual(certificate(text()+'With effect from : 01.09.2025','甲幼稚園','香港某街1號')['status'],'DATE_REVIEW')
 def test_period_bound(self):self.assertEqual(certificate(text(periods=13,total='1300.00'),'甲幼稚園','香港某街1號')['status'],'ARITHMETIC_REVIEW')
 def test_duplicate_rows_rejected(self):self.assertEqual(certificate(text().replace('With effect','NURSERY WHOLE-DAY\n100.00 - 11/- 1100.00\nWith effect'),'甲幼稚園','香港某街1號')['status'],'LAYOUT_REVIEW')
 def test_money_decimal(self):self.assertEqual(amount('1,234.50'),123450)
 def test_evidence_offsets(self):
  t=text();f=certificate(t,'甲幼稚園','香港某街1號')['rows'][0];self.assertEqual(t[f['evidence_start']:f['evidence_end']],f['evidence_text'])
if __name__=='__main__':unittest.main()

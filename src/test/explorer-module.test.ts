import {describe,expect,it} from 'vitest';
import {getRouteModule,hasModuleAccess,MODULE_KEYS_LIST,MODULE_LABELS} from '@/lib/module-access';
describe('Explorer module registration',()=>{
 it('has its own key and label in shared role/user settings',()=>{
  expect(MODULE_KEYS_LIST).toContain('customer_explorer');
  expect(MODULE_LABELS.customer_explorer).toBe('Customer Explorer');
 });
 it('does not inherit Knowledge Base route permission',()=>{
  expect(getRouteModule('/customer-explorer')?.moduleKey).toBe('customer_explorer');
  expect(hasModuleAccess([{module_key:'knowledge_base',access_level:'admin'}],'customer_explorer')).toBe(false);
 });
 it('honours per-module no access and allows partner view eligibility',()=>{
  expect(hasModuleAccess([{module_key:'customer_explorer',access_level:'no_access'}],'customer_explorer')).toBe(false);
  expect(hasModuleAccess([{module_key:'customer_explorer',access_level:'view'}],'customer_explorer',{isPartnerUser:true})).toBe(true);
 });
});
